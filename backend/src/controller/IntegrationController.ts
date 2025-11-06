import { FastifyInstance } from "fastify"
import IntegrationService from "../service/IntegrationService"

export default async function integrationController(fastify: FastifyInstance) {
    fastify.post<{
        Params: {
            microfrontendId: string
        }
        Querystring: {
            deploymentId?: string
            environmentId?: string
        }
    }>("/microfrontend/:microfrontendId/host-injection", async (request, reply) => {
        return reply.send(await new IntegrationService(request.databaseUser).injectMicrofrontendHostData(request.params.microfrontendId, request.query.environmentId, request.query.deploymentId))
    })
}
