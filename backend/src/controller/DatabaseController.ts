import { FastifyInstance } from "fastify"
import ProjectHeaderNotFoundError from "../errors/ProjectHeaderNotFoundError"
import DatabaseService from "../service/DatabaseService"
import { DatabaseDTO } from "../types/DatabaseDTO"
import { getProjectIdFromRequest } from "../utils/requestUtils"

export default async function databaseController(fastify: FastifyInstance) {
    fastify.get("/databases", async (request, reply) => {
        const projectId = getProjectIdFromRequest(request)
        if (!projectId) {
            throw new ProjectHeaderNotFoundError()
        }
        const databases = await new DatabaseService(request.databaseUser).getByProjectId(projectId)
        return reply.send(databases.map(database => database.toFrontendObject()))
    })

    fastify.get<{ Params: { databaseId: string } }>("/databases/:databaseId", async (request, reply) => {
        const database = await new DatabaseService(request.databaseUser).getById(request.params.databaseId)
        return reply.send(database.toFrontendObject())
    })

    fastify.post<{ Body: DatabaseDTO }>("/databases", async (request, reply) => {
        const projectId = getProjectIdFromRequest(request)
        if (!projectId) {
            throw new ProjectHeaderNotFoundError()
        }
        const database = await new DatabaseService(request.databaseUser).create(projectId, request.body)
        return reply.send(database.toFrontendObject())
    })

    fastify.put<{ Body: DatabaseDTO; Params: { databaseId: string } }>("/databases/:databaseId", async (request, reply) => {
        const database = await new DatabaseService(request.databaseUser).update(request.params.databaseId, request.body)
        return reply.send(database.toFrontendObject())
    })

    fastify.delete<{ Params: { databaseId: string } }>("/databases/:databaseId", async (request, reply) => {
        await new DatabaseService(request.databaseUser).delete(request.params.databaseId)
        return reply.status(204).send()
    })
}
