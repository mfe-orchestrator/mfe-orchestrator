import { FastifyInstance } from "fastify"
import ProjectHeaderNotFoundError from "../errors/ProjectHeaderNotFoundError"
import { StorageService } from "../service/StorageService"
import { StorageDTO } from "../types/StorageDTO"
import { CONNECTION_TEST_ROUTE_CONFIG } from "../utils/connectionTest"
import { getProjectIdFromRequest } from "../utils/requestUtils"

export default async function storageController(fastify: FastifyInstance) {
    // Get storages by project ID
    fastify.get<{ Params: { projectId: string } }>("/projects/:projectId/storages", async (request, reply) => {
        const storages = await new StorageService(request.databaseUser).getByProjectId(request.params.projectId)
        return reply.send(storages.map(storage => storage.toFrontendObject()))
    })

    // Add storage to project
    fastify.get<{ Params: { storageId: string } }>("/storages/:storageId", async (request, reply) => {
        const storage = await new StorageService(request.databaseUser).getById(request.params.storageId)
        return reply.send(storage.toFrontendObject())
    })

    // Add storage to project
    fastify.post<{ Body: StorageDTO }>("/storages", async (request, reply) => {
        const projectId = getProjectIdFromRequest(request)

        if (!projectId) {
            return reply.status(400).send({ error: "Project ID is required" })
        }

        const storage = await new StorageService(request.databaseUser).create(projectId, request.body)
        return reply.send(storage.toFrontendObject())
    })

    // Writes, reads back and deletes a probe file with what the form holds, without saving it.
    // A storage that refuses is the result of the test, not an error: both answer 200
    fastify.post<{ Body: StorageDTO }>("/storages/test", { config: CONNECTION_TEST_ROUTE_CONFIG }, async (request, reply) => {
        const projectId = getProjectIdFromRequest(request)
        if (!projectId) {
            throw new ProjectHeaderNotFoundError()
        }

        return reply.send(await new StorageService(request.databaseUser).testConnection(request.body, { projectId }))
    })

    fastify.post<{ Body: StorageDTO; Params: { storageId: string } }>("/storages/:storageId/test", { config: CONNECTION_TEST_ROUTE_CONFIG }, async (request, reply) => {
        return reply.send(await new StorageService(request.databaseUser).testConnection(request.body, { storageId: request.params.storageId }))
    })

    // Update storage
    fastify.put<{ Body: StorageDTO; Params: { storageId: string } }>("/storages/:storageId", async (request, reply) => {
        const storage = await new StorageService(request.databaseUser).update(request.params.storageId, request.body)
        return reply.send(storage.toFrontendObject())
    })

    // Delete storage
    fastify.delete<{ Params: { storageId: string } }>("/storages/:storageId", async (request, reply) => {
        await new StorageService(request.databaseUser).delete(request.params.storageId)
        return reply.status(204).send()
    })

    // Set storage as default
    fastify.put<{ Params: { storageId: string } }>("/storages/:storageId/default", async (request, reply) => {
        const storage = await new StorageService(request.databaseUser).makeDefault(request.params.storageId)
        return reply.send(storage.toFrontendObject())
    })
}
