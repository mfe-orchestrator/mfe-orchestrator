import { FastifyInstance } from "fastify"
import GlobalVariableDTO from "../types/GlobalVariableDTO"
import { getEnvironmentIdFromRequest, getProjectIdFromRequest } from "../utils/requestUtils"
import GlobalVariablesService from "../service/GlobalVariablesService"
import EnvironmentHeaderNotFoundError from "../errors/EnvironmentHeaderNotFoundError"
import GlobalVariableCreateDTO, { GlobalVariableUpdateDTO } from "../types/GlobalVariableCreateDTO"
import ProjectHeaderNotFoundError from "../errors/ProjectHeaderNotFoundError"

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

    fastify.post<{ Body: GlobalVariableCreateDTO }>("/global-variables", async (request, reply) => {
        const projectId = getProjectIdFromRequest(request)
        if (!projectId) {
            throw new ProjectHeaderNotFoundError()
        }
        return reply.send(await new GlobalVariablesService(request.databaseUser).createForProject(request.body, projectId))
    })

    fastify.put<{ Body: GlobalVariableUpdateDTO }>("/global-variables", async (request, reply) => {
        const projectId = getProjectIdFromRequest(request)
        if (!projectId) {
            throw new ProjectHeaderNotFoundError()
        }
        return reply.send(await new GlobalVariablesService(request.databaseUser).updateByProjectId(request.body, projectId))
    })

    fastify.delete<{ Body: { key: string } }>("/global-variables", async (request, reply) => {
        const projectId = getProjectIdFromRequest(request)
        if (!projectId) {
            throw new ProjectHeaderNotFoundError()
        }
        return reply.send(await new GlobalVariablesService(request.databaseUser).deleteByProjectId(request.body.key, projectId))
    })
}
