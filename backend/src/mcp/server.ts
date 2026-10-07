import { McpServer } from "@modelcontextprotocol/server"
import { version as applicationVersion } from "../../package.json"
import { BusinessException } from "../errors/BusinessException"
import CustomError from "../errors/CustomError"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import UserCannotAccessThisDeploymentError from "../errors/UserCannotAccessThisDeploymentError"
import UserCannotAccessThisEnvironmentError from "../errors/UserCannotAccessThisEnvironmentError"
import UserCannotAccessThisOrganizationError from "../errors/UserCannotAccessThisOrganizationError"
import UserCannotAccessThisProjectError from "../errors/UserCannotAccessThisProjectError"
import { RoleInProject } from "../models/UserProjectModel"
import { MCP_SCOPE_WRITE } from "../utils/oauthConfig"
import { McpSession, McpSharedProject, McpToolContext, McpToolDefinition, objectId } from "./toolDefinition"
import { configurationTools } from "./tools/configurationTools"
import { environmentTools } from "./tools/environmentTools"
import { microfrontendTools } from "./tools/microfrontendTools"
import { organizationTools } from "./tools/organizationTools"
import { projectTools } from "./tools/projectTools"
import { repositoryTools } from "./tools/repositoryTools"

/**
 * Every tool the MCP server can expose.
 *
 * Parity with the console, minus what v1 leaves out on purpose: API keys (creating or showing one
 * hands a long-lived credential to the client), scaffolding a repository from a template (it pushes
 * an API key into the new repository), creating or editing storages and repository connections
 * (their input is a secret), and everything above the project (projects, organizations, members,
 * invitations, the user profile), bundle upload and the canvas layout.
 */
export const MCP_TOOLS: McpToolDefinition[] = [...organizationTools, ...projectTools, ...microfrontendTools, ...environmentTools, ...repositoryTools, ...configurationTools]

const SERVER_INSTRUCTIONS =
    "Tools of the MFE Orchestrator console, bound to the projects shared when this connection was authorized. " +
    "Call projects_list first: when more than one project is shared, every project tool needs its projectId. " +
    "Ids are 24 character hexadecimal strings returned by the list tools. Tools marked destructive change what users are served " +
    "(deploy, rollback) or delete data: confirm with the user before calling them."

/**
 * What the client is told when a tool fails. The console's own errors are written to be shown
 * to the user, so their message goes through; anything else may carry internals (a driver error,
 * a provider response) and is reported generically, the details stay in the server log.
 */
export const NOT_FOUND_IN_PROJECT = "Not found in this project"

export const describeToolError = (error: unknown): string => {
    // An MCP principal is always confined to one project. "Cannot access" next to "not found" would
    // tell the client which ids exist in other projects, so both read the same.
    if (
        error instanceof EntityNotFoundError ||
        error instanceof UserCannotAccessThisProjectError ||
        error instanceof UserCannotAccessThisEnvironmentError ||
        error instanceof UserCannotAccessThisDeploymentError ||
        error instanceof UserCannotAccessThisOrganizationError
    ) {
        return NOT_FOUND_IN_PROJECT
    }
    if (error instanceof BusinessException || error instanceof CustomError) {
        return error.message
    }
    if (error instanceof Error && (error as { type?: string }).type === "AuthenticationError") {
        return error.message
    }
    return "The operation failed. Check the console for details."
}

const toToolResult = (value: unknown) => ({
    content: [{ type: "text" as const, text: JSON.stringify(value ?? null, null, 2) }]
})

/**
 * The MCP server for one request, with only the tools the token's scopes allow.
 *
 * A read-only token does not even list the write tools; the scope is checked again when a tool
 * runs, so a client that guesses a tool name it was not shown gets an error, not the tool.
 */
export interface McpServerHooks {
    onToolError?: (tool: string, error: unknown, projectId?: string) => void
    onToolCall?: (tool: string, outcome: "ok" | "error" | "denied", projectId?: string) => void
}

/** A refusal written for the client to act on: which project to pass, or why writing is not allowed there. */
export class McpProjectSelectionError extends CustomError {
    constructor(message: string) {
        super(message)
        this.name = "McpProjectSelectionError"
        Object.setPrototypeOf(this, McpProjectSelectionError.prototype)
    }
}

const PROJECT_ID_INPUT = objectId("Project to act on. Optional when this connection shares a single project, required otherwise: see projects_list").optional()

/** The input a client sees for a tool: project tools gain the optional `projectId`. */
export const registeredInputSchema = (tool: McpToolDefinition) => (tool.projectScoped === false ? tool.inputSchema : tool.inputSchema.extend({ projectId: PROJECT_ID_INPUT }))

/**
 * The project a call acts on. Defaults to the only shared one; with several, the client has to
 * say which, and gets told how to find out. A project outside the shared set is refused the same
 * way, whether it exists or not.
 */
export const selectProject = (session: McpSession, requested: string | undefined): McpSharedProject => {
    if (requested) {
        const project = session.projects.find(candidate => candidate.projectId === requested)
        if (!project) {
            throw new McpProjectSelectionError(`Project ${requested} is not shared with this connection. Call projects_list to see the shared projects.`)
        }
        return project
    }
    if (session.projects.length === 1) {
        return session.projects[0]
    }
    throw new McpProjectSelectionError(`This connection shares ${session.projects.length} projects: pass projectId. Call projects_list to see them.`)
}

/**
 * The MCP server for one request, with only the tools the scopes in force allow.
 *
 * A read-only connection does not even list the write tools. The scope is checked again when a
 * tool runs, and so is the role on the project the call picked: a grant with `mfe:write` over two
 * projects, one of which the user only views, writes on the other one only.
 */
export const createMcpServer = (session: McpSession, hooks: McpServerHooks = {}): McpServer => {
    const server = new McpServer({ name: "mfe-orchestrator", title: "MFE Orchestrator", version: applicationVersion }, { instructions: SERVER_INSTRUCTIONS })

    for (const tool of MCP_TOOLS) {
        if (!session.scopes.includes(tool.scope)) {
            continue
        }
        server.registerTool(
            tool.name,
            {
                title: tool.title,
                description: tool.description,
                inputSchema: registeredInputSchema(tool),
                annotations: { title: tool.title, ...tool.annotations }
            },
            (async (input: Record<string, unknown>) => {
                let projectId: string | undefined
                if (!session.scopes.includes(tool.scope)) {
                    hooks.onToolCall?.(tool.name, "denied")
                    return { isError: true, content: [{ type: "text" as const, text: `This connection lacks the ${tool.scope} permission` }] }
                }
                try {
                    let context: McpToolContext
                    let args: Record<string, unknown> = input
                    if (tool.projectScoped === false) {
                        context = { principal: session.principal, projectId: "", scopes: session.scopes, credential: session.credential, session }
                    } else {
                        const { projectId: requested, ...rest } = input
                        const project = selectProject(session, requested as string | undefined)
                        projectId = project.projectId
                        if (tool.scope === MCP_SCOPE_WRITE && project.role === RoleInProject.VIEWER) {
                            hooks.onToolCall?.(tool.name, "denied", projectId)
                            return { isError: true, content: [{ type: "text" as const, text: `You are a VIEWER on project ${projectId}: ${tool.name} changes data and is not allowed there.` }] }
                        }
                        args = rest
                        // Narrowed to the picked project: every id in the input is checked against it
                        context = {
                            principal: { ...session.principal, restrictedToProjectIds: [projectId] },
                            projectId,
                            scopes: session.scopes,
                            credential: session.credential,
                            session
                        }
                    }
                    const result = toToolResult(await tool.run(args as never, context))
                    hooks.onToolCall?.(tool.name, "ok", projectId)
                    return result
                } catch (error) {
                    hooks.onToolError?.(tool.name, error, projectId)
                    hooks.onToolCall?.(tool.name, "error", projectId)
                    return { isError: true, content: [{ type: "text" as const, text: describeToolError(error) }] }
                }
            }) as never
        )
    }

    return server
}
