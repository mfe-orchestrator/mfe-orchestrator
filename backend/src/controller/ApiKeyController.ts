import { FastifyInstance } from "fastify"
import { ApiKeyDTO } from "../types/ApiKeyDTO"
import { ApiKeyService } from "../service/ApiKeyService"
import { ApiKeyStatus } from "../models/ApiKeyModel"
import { getProjectIdFromRequest } from "../utils/requestUtils"

export default async function apiKeyController(fastify: FastifyInstance) {
    fastify.get<{ Params: { projectId: string } }>("/projects/:projectId/api-keys", async (request, reply) => {
        const apiKeys = await new ApiKeyService(request.databaseUser).getByProjectId(request.params.projectId)
        return reply.send(apiKeys.map(apiKey => apiKey.toFrontendObject()))
    })

    fastify.post<{ Body: ApiKeyDTO }>("/api-keys", async (request, reply) => {
        const projectId = getProjectIdFromRequest(request)

        if (!projectId) {
            return reply.status(400).send({ error: "Project ID is required" })
        }

        const apiKey = await new ApiKeyService(request.databaseUser).create(projectId, request.body)
        return reply.send(apiKey)
    })

    fastify.put<{ Params: { apiKeyId: string } }>("/api-keys/:apiKeyId/revoke", async (request, reply) => {
        const apiKey = await new ApiKeyService(request.databaseUser).setStatus(request.params.apiKeyId, ApiKeyStatus.INACTIVE)
        return reply.send(apiKey)
    })

    fastify.delete<{ Params: { apiKeyId: string } }>("/api-keys/:apiKeyId", async (request, reply) => {
        await new ApiKeyService(request.databaseUser).delete(request.params.apiKeyId)
        return reply.status(204).send()
    })
}
