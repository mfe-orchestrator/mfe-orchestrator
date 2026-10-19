import { FastifyInstance } from "fastify"
import ProjectHeaderNotFoundError from "../errors/ProjectHeaderNotFoundError"
import VariableMapService from "../service/VariableMapService"
import VariableMapDTO, { VariableMapKind } from "../types/VariableMapDTO"
import { getProjectIdFromRequest } from "../utils/requestUtils"

const ROUTES: Array<[string, VariableMapKind]> = [
    ["/config-maps", "configMap"],
    ["/secrets", "secret"]
]

export default async function variableMapController(fastify: FastifyInstance) {
    for (const [path, kind] of ROUTES) {
        fastify.get(path, async (request, reply) => {
            const projectId = getProjectIdFromRequest(request)
            if (!projectId) {
                throw new ProjectHeaderNotFoundError()
            }
            return reply.send(await new VariableMapService(kind, request.databaseUser).getByProjectId(projectId))
        })

        fastify.get<{ Params: { id: string } }>(`${path}/:id`, async (request, reply) => {
            return reply.send(await new VariableMapService(kind, request.databaseUser).getById(request.params.id))
        })

        fastify.post<{ Body: VariableMapDTO }>(path, async (request, reply) => {
            const projectId = getProjectIdFromRequest(request)
            if (!projectId) {
                throw new ProjectHeaderNotFoundError()
            }
            return reply.send(await new VariableMapService(kind, request.databaseUser).create(request.body, projectId))
        })

        fastify.put<{ Params: { id: string }; Body: VariableMapDTO }>(`${path}/:id`, async (request, reply) => {
            return reply.send(await new VariableMapService(kind, request.databaseUser).update(request.params.id, request.body))
        })

        fastify.delete<{ Params: { id: string } }>(`${path}/:id`, async (request, reply) => {
            return reply.send(await new VariableMapService(kind, request.databaseUser).delete(request.params.id))
        })
    }
}
