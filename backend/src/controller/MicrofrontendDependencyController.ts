import { FastifyInstance } from "fastify"
import ProjectHeaderNotFoundError from "../errors/ProjectHeaderNotFoundError"
import MicrofrontendDependencyService from "../service/MicrofrontendDependencyService"
import { AlignmentApplyRequestDTO } from "../types/MicrofrontendDependencyDTO"
import { getProjectIdFromRequest } from "../utils/requestUtils"

export default async function microfrontendDependencyController(fastify: FastifyInstance) {
    fastify.get("/dependencies", async (request, reply) => {
        const projectId = getProjectIdFromRequest(request)
        if (!projectId) {
            throw new ProjectHeaderNotFoundError()
        }
        return reply.send(await new MicrofrontendDependencyService(request.databaseUser).getReport(projectId))
    })

    fastify.get<{
        Params: {
            projectId: string
        }
    }>("/projects/:projectId/dependencies", async (request, reply) => {
        return reply.send(await new MicrofrontendDependencyService(request.databaseUser).getReport(request.params.projectId))
    })

    fastify.post<{
        Body: AlignmentApplyRequestDTO
    }>("/dependencies/peer/alignment-plan", async (request, reply) => {
        const projectId = getProjectIdFromRequest(request)
        if (!projectId) {
            throw new ProjectHeaderNotFoundError()
        }
        return reply.send(await new MicrofrontendDependencyService(request.databaseUser).getAlignmentPlan(projectId, request.body || {}))
    })

    fastify.post<{
        Body: AlignmentApplyRequestDTO
    }>("/dependencies/peer/align", async (request, reply) => {
        const projectId = getProjectIdFromRequest(request)
        if (!projectId) {
            throw new ProjectHeaderNotFoundError()
        }
        return reply.send(await new MicrofrontendDependencyService(request.databaseUser).applyAlignment(projectId, request.body || {}))
    })
}
