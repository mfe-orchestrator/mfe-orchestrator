import { FastifyInstance } from "fastify"
import ProjectHeaderNotFoundError from "../errors/ProjectHeaderNotFoundError"
import FederationIntegrationService, { FederationIntegrationApplyRequestDTO, IntegrationScope } from "../service/FederationIntegrationService"
import { getProjectIdFromRequest } from "../utils/requestUtils"

export default async function integrationController(fastify: FastifyInstance) {
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

    /** Dry run: which documents would gain the runtime configuration script tag */
    fastify.get("/integration/global-variables/plan", async (request, reply) => {
        const projectId = getProjectIdFromRequest(request)
        if (!projectId) {
            throw new ProjectHeaderNotFoundError()
        }
        return reply.send(await new FederationIntegrationService(request.databaseUser).getPlan(projectId, IntegrationScope.GLOBAL_VARIABLES))
    })

    fastify.post<{
        Body: FederationIntegrationApplyRequestDTO
    }>("/integration/global-variables/apply", async (request, reply) => {
        const projectId = getProjectIdFromRequest(request)
        if (!projectId) {
            throw new ProjectHeaderNotFoundError()
        }
        return reply.send(await new FederationIntegrationService(request.databaseUser).apply(projectId, request.body, IntegrationScope.GLOBAL_VARIABLES))
    })
}
