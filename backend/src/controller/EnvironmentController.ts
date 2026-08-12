import { FastifyInstance } from "fastify"
import ProjectHeaderNotFoundError from "../errors/ProjectHeaderNotFoundError"
import { createEnvironmentSchema, createEnvironmentsBulkSchema, deleteEnvironmentsSchema, environmentIdSchema, reorderEnvironmentsSchema, updateEnvironmentSchema } from "../schemas/environment.schema"
import DeploymentService from "../service/DeploymentService"
import EnvironmentService from "../service/EnvironmentService"
import { EnvironmentDTO, EnvironmentOrderDTO } from "../types/EnvironmentDTO"
import { getProjectIdFromRequest } from "../utils/requestUtils"

export default async function environmentController(fastify: FastifyInstance) {
    fastify.get("/environments", async (request, reply) => {
        const projectId = getProjectIdFromRequest(request)
        if (!projectId) {
            throw new ProjectHeaderNotFoundError()
        }

        const environments = await new EnvironmentService(request.databaseUser).getByProjectId(projectId)
        return reply.send(environments)
    })

    fastify.get<{ Params: { id: string } }>("/environments/:id/deployments", { schema: environmentIdSchema }, async (request, reply) => {
        return reply.send(await new DeploymentService(request.databaseUser).getByEnvironmentId(request.params.id))
    })

    fastify.get<{ Params: { id: string } }>("/environments/:id/deployments/last", { schema: environmentIdSchema }, async (request, reply) => {
        return reply.send(await new DeploymentService(request.databaseUser).getLastByEnvironmentId(request.params.id))
    })

    fastify.post<{ Body: EnvironmentDTO }>("/environments", { schema: createEnvironmentSchema }, async (request, reply) => {
        const projectId = getProjectIdFromRequest(request)
        if (!projectId) {
            throw new ProjectHeaderNotFoundError()
        }

        const environment = await new EnvironmentService(request.databaseUser).create(request.body, projectId)
        return reply.send(environment)
    })

    fastify.post<{ Body: EnvironmentDTO[] }>("/environments/bulk", { schema: createEnvironmentsBulkSchema }, async (request, reply) => {
        const projectId = getProjectIdFromRequest(request)
        if (!projectId) {
            throw new ProjectHeaderNotFoundError()
        }
        return reply.send(await new EnvironmentService(request.databaseUser).createBulk(request.body, projectId))
    })

    fastify.put<{ Body: EnvironmentOrderDTO }>("/environments/order", { schema: reorderEnvironmentsSchema }, async (request, reply) => {
        const projectId = getProjectIdFromRequest(request)
        if (!projectId) {
            throw new ProjectHeaderNotFoundError()
        }

        const environments = await new EnvironmentService(request.databaseUser).updateOrder(projectId, request.body?.ids)
        return reply.send(environments)
    })

    fastify.put<{ Body: EnvironmentDTO; Params: { id: string } }>("/environments/:id", { schema: updateEnvironmentSchema }, async (request, reply) => {
        const environment = await new EnvironmentService(request.databaseUser).update(request.params.id, request.body)
        return reply.send(environment)
    })

    fastify.delete<{ Params: { id: string } }>("/environments/:id", { schema: environmentIdSchema }, async (request, reply) => {
        await new EnvironmentService(request.databaseUser).deleteSingle(request.params.id)
        return reply.send()
    })

    fastify.delete<{ Body: string[] }>("/environments", { schema: deleteEnvironmentsSchema }, async (request, reply) => {
        const result = await new EnvironmentService(request.databaseUser).deleteMultiple(request.body)
        return reply.send(result)
    })
}
