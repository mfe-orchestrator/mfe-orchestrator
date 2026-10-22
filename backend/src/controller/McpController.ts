import { toNodeHandler } from "@modelcontextprotocol/node"
import { createMcpHandler } from "@modelcontextprotocol/server"
import { FastifyInstance, FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from "fastify"
import { authenticateMcpRequest, buildWwwAuthenticate, MCP_CONTEXT_KEY, McpAuthenticationResult } from "../mcp/authentication"
import { createMcpServer } from "../mcp/server"
import { credentialBucket, credentialLogFields, McpSession } from "../mcp/toolDefinition"
import AuthenticationMethod from "../types/AuthenticationMethod"
import { getOAuthConfig } from "../utils/oauthConfig"

/**
 * The remote MCP server (streamable HTTP, stateless).
 *
 * Each POST is authenticated here, then handed to the SDK, which builds a fresh server for the
 * request from the factory: the tools a client sees always match the scopes in force right now.
 * No session is kept, so GET (server-initiated stream) and DELETE (session end) do not apply.
 */
export default async function mcpController(fastify: FastifyInstance) {
    const config = getOAuthConfig()
    if (!config.enabled) {
        return
    }

    const handler = createMcpHandler(
        ({ authInfo }) => {
            const session = authInfo?.extra?.[MCP_CONTEXT_KEY] as McpSession | undefined
            if (!session) {
                // Unreachable: the route below never calls the handler without authentication
                throw new Error("MCP request reached the server without an authenticated context")
            }
            return createMcpServer(session, {
                onToolError: (tool, error, projectId) => fastify.log.warn({ err: error, tool, projectId, ...credentialLogFields(session.credential) }, "MCP tool failed"),
                // One audit line per call, naming the project it acted on and the grant or the API key that made it
                onToolCall: (tool, outcome, projectId) => fastify.log.info({ audit: "mcp_tool_call", tool, outcome, projectId, ...credentialLogFields(session.credential) }, "MCP tool call")
            })
        },
        { onerror: error => fastify.log.warn({ err: error }, "MCP request rejected") }
    )
    const nodeHandler = toNodeHandler(handler, { onerror: error => fastify.log.error({ err: error }, "MCP handler failed") })

    const publicRoute = { config: { authMethod: AuthenticationMethod.PUBLIC } }

    // Who is calling, resolved once per request and read again by the rate limit and the handler
    const authentications = new WeakMap<FastifyRequest, Extract<McpAuthenticationResult, { authInfo: unknown }>>()

    // Authentication is this route's own: the console's preHandler knows nothing of MCP tokens,
    // and the 401 has to carry the RFC 9728 challenge clients discover the authorization server by.
    const authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
        const authentication = await authenticateMcpRequest(request.headers, config)
        if ("error" in authentication) {
            return reply
                .code(401)
                .header("WWW-Authenticate", buildWwwAuthenticate(config, authentication.error === "invalid_token" ? "invalid_token" : undefined))
                .send({ error: authentication.error === "invalid_token" ? "invalid_token" : "unauthorized", error_description: "A valid MCP access token or project API key is required" })
        }
        authentications.set(request, authentication)
    }

    // After authentication, so each grant and each API key gets its own bucket: the per-IP limit
    // alone would let one runaway client exhaust a whole office behind the same NAT, and could not
    // tell two clients of the same user apart. Absent only where the rate-limit plugin is not loaded.
    const preHandler: preHandlerAsyncHookHandler[] = [authenticate]
    if (fastify.hasDecorator("rateLimit")) {
        preHandler.push(
            fastify.rateLimit({
                max: config.mcpRateLimitMax,
                timeWindow: "1 minute",
                keyGenerator: request => {
                    const authentication = authentications.get(request)
                    return authentication ? `mcp:${credentialBucket(authentication.session.credential)}` : `mcp:ip:${request.ip}`
                }
            }) as preHandlerAsyncHookHandler
        )
    }

    fastify.post("/mcp", { ...publicRoute, preHandler }, async (request, reply) => {
        const authentication = authentications.get(request)!

        // The SDK writes the response on the raw socket: headers already staged on the reply
        // (CORS, helmet, rate limit) would otherwise be lost, as for the build status stream.
        for (const [name, value] of Object.entries(reply.getHeaders())) {
            if (value !== undefined) {
                reply.raw.setHeader(name, value as string | number | string[])
            }
        }
        reply.hijack()
        await nodeHandler(Object.assign(request.raw, { auth: authentication.authInfo }), reply.raw, request.body)
    })

    fastify.route({
        method: ["GET", "DELETE"],
        url: "/mcp",
        ...publicRoute,
        handler: async (_request, reply) => reply.code(405).header("Allow", "POST").send({ error: "method_not_allowed", error_description: "This MCP server is stateless: use POST" })
    })
}
