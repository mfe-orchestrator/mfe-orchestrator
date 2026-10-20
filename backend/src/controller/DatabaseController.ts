import { FastifyInstance } from "fastify"
import ProjectHeaderNotFoundError from "../errors/ProjectHeaderNotFoundError"
import DatabaseService from "../service/DatabaseService"
import { DatabaseDTO } from "../types/DatabaseDTO"
import { CONNECTION_TEST_ROUTE_CONFIG } from "../utils/connectionTest"
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

    // A connection that does not answer is the result of the test, not an error: both answer 200
    fastify.post<{ Body: DatabaseDTO }>("/databases/test", { config: CONNECTION_TEST_ROUTE_CONFIG }, async (request, reply) => {
        const projectId = getProjectIdFromRequest(request)
        if (!projectId) {
            throw new ProjectHeaderNotFoundError()
        }
        return reply.send(await new DatabaseService(request.databaseUser).testConnection(request.body, { projectId }))
    })

    fastify.post<{ Body: DatabaseDTO; Params: { databaseId: string } }>("/databases/:databaseId/test", { config: CONNECTION_TEST_ROUTE_CONFIG }, async (request, reply) =>
        reply.send(await new DatabaseService(request.databaseUser).testConnection(request.body, { databaseId: request.params.databaseId }))
    )

    fastify.put<{ Body: DatabaseDTO; Params: { databaseId: string } }>("/databases/:databaseId", async (request, reply) => {
        const database = await new DatabaseService(request.databaseUser).update(request.params.databaseId, request.body)
        return reply.send(database.toFrontendObject())
    })

    fastify.delete<{ Params: { databaseId: string } }>("/databases/:databaseId", async (request, reply) => {
        await new DatabaseService(request.databaseUser).delete(request.params.databaseId)
        return reply.status(204).send()
    })
}
