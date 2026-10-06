import { McpServer } from "@modelcontextprotocol/server"
import { version as applicationVersion } from "../../package.json"
import { BusinessException } from "../errors/BusinessException"
import CustomError from "../errors/CustomError"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import UserCannotAccessThisDeploymentError from "../errors/UserCannotAccessThisDeploymentError"
import UserCannotAccessThisEnvironmentError from "../errors/UserCannotAccessThisEnvironmentError"
import UserCannotAccessThisOrganizationError from "../errors/UserCannotAccessThisOrganizationError"
import UserCannotAccessThisProjectError from "../errors/UserCannotAccessThisProjectError"
import { McpToolContext, McpToolDefinition } from "./toolDefinition"
import { configurationTools } from "./tools/configurationTools"
import { environmentTools } from "./tools/environmentTools"
import { microfrontendTools } from "./tools/microfrontendTools"
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
export const MCP_TOOLS: McpToolDefinition[] = [...projectTools, ...microfrontendTools, ...environmentTools, ...repositoryTools, ...configurationTools]

const SERVER_INSTRUCTIONS =
    "Tools of the MFE Orchestrator console, bound to the single project chosen when this connection was authorized. " +
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
    onToolError?: (tool: string, error: unknown) => void
    onToolCall?: (tool: string, outcome: "ok" | "error" | "denied") => void
}

export const createMcpServer = (context: McpToolContext, hooks: McpServerHooks = {}): McpServer => {
    const server = new McpServer({ name: "mfe-orchestrator", title: "MFE Orchestrator", version: applicationVersion }, { instructions: SERVER_INSTRUCTIONS })

    for (const tool of MCP_TOOLS) {
        if (!context.scopes.includes(tool.scope)) {
            continue
        }
        server.registerTool(
            tool.name,
            {
                title: tool.title,
                description: tool.description,
                inputSchema: tool.inputSchema,
                annotations: { title: tool.title, ...tool.annotations }
            },
            (async (args: unknown) => {
                if (!context.scopes.includes(tool.scope)) {
                    hooks.onToolCall?.(tool.name, "denied")
                    return { isError: true, content: [{ type: "text" as const, text: `This connection lacks the ${tool.scope} permission` }] }
                }
                try {
                    const result = toToolResult(await tool.run(args as never, context))
                    hooks.onToolCall?.(tool.name, "ok")
                    return result
                } catch (error) {
                    hooks.onToolError?.(tool.name, error)
                    hooks.onToolCall?.(tool.name, "error")
                    return { isError: true, content: [{ type: "text" as const, text: describeToolError(error) }] }
                }
            }) as never
        )
    }

    return server
}
