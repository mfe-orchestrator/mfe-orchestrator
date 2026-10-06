import { z } from "zod"
import { AuthorizedPrincipal } from "../service/BaseAuthorizedService"
import { McpScope } from "../utils/oauthConfig"

/**
 * Who a tool runs for. The principal is the user restricted to the token's project, so every
 * service a tool calls refuses anything outside it; `projectId` is that same project, which is why
 * no tool takes a project id as input.
 */
export interface McpToolContext {
    principal: AuthorizedPrincipal
    projectId: string
    scopes: string[]
    /** What authenticated the request, for the audit log: an OAuth grant or a project API key. */
    credential: McpCredential
}

export type McpCredential = { kind: "oauth"; grantId: string; clientId: string } | { kind: "api_key"; apiKeyId: string }

/** The audit fields of a credential: a grant and an API key never share a field name. */
export const credentialLogFields = (credential: McpCredential) =>
    credential.kind === "oauth" ? { authKind: "oauth", grantId: credential.grantId, clientId: credential.clientId } : { authKind: "api_key", apiKeyId: credential.apiKeyId }

/** One rate limit bucket per grant or per API key. */
export const credentialBucket = (credential: McpCredential) => (credential.kind === "oauth" ? `grant:${credential.grantId}` : `api-key:${credential.apiKeyId}`)

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
    annotations: McpToolAnnotations
    inputSchema: Schema
    run: (args: z.infer<Schema>, context: McpToolContext) => Promise<unknown>
}

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
