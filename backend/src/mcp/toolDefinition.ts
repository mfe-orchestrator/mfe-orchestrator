import { z } from "zod"
import { AuthorizedPrincipal } from "../service/BaseAuthorizedService"
import { McpScope } from "../utils/oauthConfig"

/** A project shared with the connection, with the role that caps what can be done on it. */
export interface McpSharedProject {
    projectId: string
    /** The user's project role for an OAuth grant, the key's role (VIEWER/MANAGER) for an API key */
    role: string
}

/**
 * Who is calling, for the whole request: the principal confined to the shared projects, those
 * projects, and the scopes in force. Resolved once by the authentication.
 */
export interface McpSession {
    principal: AuthorizedPrincipal
    projects: McpSharedProject[]
    scopes: string[]
    /** What authenticated the request, for the audit log: an OAuth grant or a project API key. */
    credential: McpCredential
}

/**
 * What one tool call runs with. For a project tool the principal is narrowed to the single project
 * the call picked (`projectId`), so every id the tool receives (microfrontend, environment,
 * deployment...) is verified against that project by the services. Organization tools get the
 * whole session and an empty `projectId`.
 */
export interface McpToolContext {
    principal: AuthorizedPrincipal
    projectId: string
    scopes: string[]
    credential: McpCredential
    session: McpSession
}

/**
 * What authenticated the calls. `console` is the assistant built into the console, running the tools
 * in process for the signed-in user: there is no MCP connection behind it, only the user's session.
 */
export type McpCredential = { kind: "oauth"; grantId: string; clientId: string } | { kind: "api_key"; apiKeyId: string } | { kind: "console"; userId: string }

/** The audit fields of a credential: a grant, an API key and a console user never share a field name. */
export const credentialLogFields = (credential: McpCredential) => {
    switch (credential.kind) {
        case "oauth":
            return { authKind: "oauth", grantId: credential.grantId, clientId: credential.clientId }
        case "api_key":
            return { authKind: "api_key", apiKeyId: credential.apiKeyId }
        case "console":
            return { authKind: "console", userId: credential.userId }
    }
}

/** One rate limit bucket per grant, per API key or per console user. */
export const credentialBucket = (credential: McpCredential) => {
    switch (credential.kind) {
        case "oauth":
            return `grant:${credential.grantId}`
        case "api_key":
            return `api-key:${credential.apiKeyId}`
        case "console":
            return `user:${credential.userId}`
    }
}

/** MCP tool annotations (hints for the client, not guarantees: the scope check is what enforces). */
export interface McpToolAnnotations {
    readOnlyHint: boolean
    destructiveHint?: boolean
    idempotentHint?: boolean
    /** True when the tool reaches a system outside the console: a git provider, the npm registry. */
    openWorldHint: boolean
}

export interface McpToolDefinition<Schema extends z.ZodObject = z.ZodObject> {
    name: string
    title: string
    description: string
    /** The scope the token needs for this tool to be listed and callable at all. */
    scope: McpScope
    /**
     * Project tools (the default) receive an optional `projectId` input, required when the
     * connection shares more than one project. Set to false for tools that span the shared projects.
     */
    projectScoped?: boolean
    annotations: McpToolAnnotations
    inputSchema: Schema
    run: (args: z.infer<Schema>, context: McpToolContext) => Promise<unknown>
    /**
     * Only the console assistant offers this tool; `createMcpServer` never registers it. For
     * actions an MCP client must not get (members, API keys...), which the assistant may run
     * because it acts for the signed-in user, inside the console.
     */
    consoleOnly?: boolean
    /**
     * Splits a result that must not reach the model, such as a freshly created API key: the model
     * gets `forModel`, the user's console gets `forUser` (`forModel` when left out). Without it
     * both see the whole result. MCP clients always get the whole result.
     */
    presentResult?: (result: unknown) => { forModel: unknown; forUser?: unknown }
    /**
     * The console assistant runs this tool only once the user has confirmed it in the panel. Left
     * out, it follows `annotations.destructiveHint`; set it to true for tools that grant or change
     * access, or cannot be undone, without being destructive, so the MCP annotations stay truthful.
     */
    requiresConfirmation?: boolean
}

/** Whether the console assistant waits for the user's confirmation before running the tool. */
export const requiresConfirmation = (tool: McpToolDefinition): boolean => tool.requiresConfirmation ?? tool.annotations.destructiveHint === true

/** Keeps each definition typed against its own schema while the registry holds them all. */
export const defineTool = <Schema extends z.ZodObject>(tool: McpToolDefinition<Schema>): McpToolDefinition => tool as unknown as McpToolDefinition

export const READ_ONLY: McpToolAnnotations = { readOnlyHint: true, openWorldHint: false }
export const READ_ONLY_EXTERNAL: McpToolAnnotations = { readOnlyHint: true, openWorldHint: true }
export const WRITE: McpToolAnnotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
export const WRITE_EXTERNAL: McpToolAnnotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: true }
export const DESTRUCTIVE: McpToolAnnotations = { readOnlyHint: false, destructiveHint: true, openWorldHint: false }
export const DESTRUCTIVE_EXTERNAL: McpToolAnnotations = { readOnlyHint: false, destructiveHint: true, openWorldHint: true }

/** A MongoDB id, as every entity of the console is addressed. */
export const objectId = (description: string) =>
    z
        .string()
        .regex(/^[a-f0-9]{24}$/i, "must be a 24 character hexadecimal id")
        .describe(description)

export const NO_INPUT = z.object({})
