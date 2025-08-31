import { FastifyInstance } from "fastify"
import GlobalVariableDTO from "../types/GlobalVariableDTO"
import { getEnvironmentIdFromRequest } from "../utils/requestUtils"
import GlobalVariablesService from "../service/GlobalVariablesService"
import EnvironmentHeaderNotFoundError from "../errors/EnvironmentHeaderNotFoundError"

export default async function globalVariablesController(fastify: FastifyInstance) {

    fastify.get<{ Params: { projectId: string } }>("/projects/:projectId/global-variables", async (request, reply) => {
        const projectId = request.params.projectId
        return reply.send(await new GlobalVariablesService(request.databaseUser).getAllByProjectId(projectId))
    })

    fastify.get("/global-variables", async (request, reply) => {
        const environmentId = getEnvironmentIdFromRequest(request)
        if (!environmentId) {
            throw new EnvironmentHeaderNotFoundError()
        }
        return reply.send(await new GlobalVariablesService(request.databaseUser).getAll(environmentId))
    })

    fastify.post<{ Body: GlobalVariableDTO }>("/global-variables", async (request, reply) => {
        const environmentId = getEnvironmentIdFromRequest(request)
        if (!environmentId) {
            throw new EnvironmentHeaderNotFoundError()
        }
        return reply.send(await new GlobalVariablesService(request.databaseUser).create(request.body, environmentId))
    })

    fastify.put<{ Body: GlobalVariableDTO; Params: { id: string } }>("/global-variables/:id", async (request, reply) => {
        const environmentId = getEnvironmentIdFromRequest(request)
        if (!environmentId) {
            throw new EnvironmentHeaderNotFoundError()
        }
        return reply.send(await new GlobalVariablesService(request.databaseUser).update(request.params.id, request.body, environmentId))
    })

    fastify.delete<{ Params: { id: string } }>("/global-variables/:id", async (request, reply) => {
        const environmentId = getEnvironmentIdFromRequest(request)
        if (!environmentId) {
            throw new EnvironmentHeaderNotFoundError()
        }
        return reply.send(await new GlobalVariablesService(request.databaseUser).delete(request.params.id, environmentId))
    })
}
