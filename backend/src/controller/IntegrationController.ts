import { FastifyInstance } from "fastify"
import IntegrationService from "../service/IntegrationService"

export default async function integrationController(fastify: FastifyInstance) {
    fastify.post<{
        Params: {
            microfrontendId: string
        }
    }>("/microfrontend/:microfrontendId/host-injection", async (request, reply) => {
        return reply.send(await new IntegrationService(request.databaseUser).injectMicrofrontendHostData(request.params.microfrontendId))
    })
}
