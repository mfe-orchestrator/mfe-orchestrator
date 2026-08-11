import { FastifyInstance } from "fastify"
import ProjectHeaderNotFoundError from "../errors/ProjectHeaderNotFoundError"
import FederationIntegrationService, { FederationIntegrationApplyRequestDTO } from "../service/FederationIntegrationService"
import IntegrationService from "../service/IntegrationService"
import { getProjectIdFromRequest } from "../utils/requestUtils"

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

    /** Dry run: what wiring up module federation would change in every repository of the project */
    fastify.get("/integration/module-federation/plan", async (request, reply) => {
        const projectId = getProjectIdFromRequest(request)
        if (!projectId) {
            throw new ProjectHeaderNotFoundError()
        }
        return reply.send(await new FederationIntegrationService(request.databaseUser).getPlan(projectId))
    })

    fastify.post<{
        Body: FederationIntegrationApplyRequestDTO
    }>("/integration/module-federation/apply", async (request, reply) => {
        const projectId = getProjectIdFromRequest(request)
        if (!projectId) {
            throw new ProjectHeaderNotFoundError()
        }
        return reply.send(await new FederationIntegrationService(request.databaseUser).apply(projectId, request.body))
    })
}
