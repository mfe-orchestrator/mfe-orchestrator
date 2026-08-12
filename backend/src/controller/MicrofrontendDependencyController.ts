import { FastifyInstance } from "fastify"
import ProjectHeaderNotFoundError from "../errors/ProjectHeaderNotFoundError"
import { alignmentSchema, dependencyReportSchema, projectDependenciesSchema } from "../schemas/microfrontendDependency.schema"
import MicrofrontendDependencyService from "../service/MicrofrontendDependencyService"
import { AlignmentApplyRequestDTO, DependencyScanRequestDTO } from "../types/MicrofrontendDependencyDTO"
import { getProjectIdFromRequest } from "../utils/requestUtils"

export default async function microfrontendDependencyController(fastify: FastifyInstance) {
    fastify.get("/dependencies/targets", async (request, reply) => {
        const projectId = getProjectIdFromRequest(request)
        if (!projectId) {
            throw new ProjectHeaderNotFoundError()
        }
        return reply.send(await new MicrofrontendDependencyService(request.databaseUser).getScanTargets(projectId))
    })

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
    }>("/projects/:projectId/dependencies", { schema: projectDependenciesSchema }, async (request, reply) => {
        return reply.send(await new MicrofrontendDependencyService(request.databaseUser).getReport(request.params.projectId))
    })

    fastify.post<{
        Body: DependencyScanRequestDTO
    }>("/dependencies/report", { schema: dependencyReportSchema }, async (request, reply) => {
        const projectId = getProjectIdFromRequest(request)
        if (!projectId) {
            throw new ProjectHeaderNotFoundError()
        }
        return reply.send(await new MicrofrontendDependencyService(request.databaseUser).getReport(projectId, request.body || {}))
    })

    fastify.post<{
        Body: AlignmentApplyRequestDTO
    }>("/dependencies/peer/alignment-plan", { schema: alignmentSchema }, async (request, reply) => {
        const projectId = getProjectIdFromRequest(request)
        if (!projectId) {
            throw new ProjectHeaderNotFoundError()
        }
        return reply.send(await new MicrofrontendDependencyService(request.databaseUser).getAlignmentPlan(projectId, request.body || {}))
    })

    fastify.post<{
        Body: AlignmentApplyRequestDTO
    }>("/dependencies/peer/align", { schema: alignmentSchema }, async (request, reply) => {
        const projectId = getProjectIdFromRequest(request)
        if (!projectId) {
            throw new ProjectHeaderNotFoundError()
        }
        return reply.send(await new MicrofrontendDependencyService(request.databaseUser).applyAlignment(projectId, request.body || {}))
    })
}
