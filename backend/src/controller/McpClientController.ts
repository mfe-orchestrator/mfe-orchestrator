import { FastifyInstance } from "fastify"
import OAuthGrantService from "../service/OAuthGrantService"
import { getOAuthConfig } from "../utils/oauthConfig"

/** The console page listing which MCP clients are connected to a project, and revoking them. */
export default async function mcpClientController(fastify: FastifyInstance) {
    if (!getOAuthConfig().enabled) {
        return
    }

    fastify.get<{ Params: { projectId: string } }>("/projects/:projectId/mcp-clients", async (request, reply) => {
        return reply.send(await new OAuthGrantService(request.databaseUser).listForProject(request.params.projectId))
    })

    fastify.delete<{ Params: { grantId: string } }>("/mcp-clients/:grantId", async (request, reply) => {
        await new OAuthGrantService(request.databaseUser).revoke(request.params.grantId)
        return reply.status(204).send()
    })
}
