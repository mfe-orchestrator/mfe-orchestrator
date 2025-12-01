import { FastifyInstance } from "fastify"
import { StorageService } from "../service/StorageService"
import { StorageDTO } from "../types/StorageDTO"
import { getProjectIdFromRequest } from "../utils/requestUtils"

export default async function storageController(fastify: FastifyInstance) {
    // Get storages by project ID
    fastify.get<{ Params: { projectId: string } }>("/projects/:projectId/storages", async (request, reply) => {
        const storages = await new StorageService(request.databaseUser).getByProjectId(request.params.projectId)
        return reply.send(storages)
    })

    // Add storage to project
    fastify.get<{ Params: { storageId: string } }>("/storages/:storageId", async (request, reply) => {
        const storage = await new StorageService(request.databaseUser).getById(request.params.storageId)
        return reply.send(storage)
    })

    // Add storage to project
    fastify.post<{ Body: StorageDTO }>("/storages", async (request, reply) => {
        const projectId = getProjectIdFromRequest(request)

        if (!projectId) {
            return reply.status(400).send({ error: "Project ID is required" })
        }

        const storage = await new StorageService(request.databaseUser).create(projectId, request.body)
        return reply.send(storage)
    })

    // Update storage
    fastify.put<{ Body: StorageDTO; Params: { storageId: string } }>("/storages/:storageId", async (request, reply) => {
        const storage = await new StorageService(request.databaseUser).update(request.params.storageId, request.body)
        return reply.send(storage)
    })

    // Delete storage
    fastify.delete<{ Params: { storageId: string } }>("/storages/:storageId", async (request, reply) => {
        await new StorageService(request.databaseUser).delete(request.params.storageId)
        return reply.status(204).send()
    })

    // Set storage as default
    fastify.put<{ Params: { storageId: string } }>("/storages/:storageId/default", async (request, reply) => {
        const storage = await new StorageService(request.databaseUser).makeDefault(request.params.storageId)
        return reply.send(storage)
    })
}
