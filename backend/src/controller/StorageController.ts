import { FastifyInstance } from "fastify"
import { StorageService } from "../service/StorageService"

export default async function storageController(fastify: FastifyInstance) {
    // Get storages by project ID
    fastify.get<{ Params: { projectId: string } }>("/projects/:projectId/storages", async (request, reply) => {
        const storages = await new StorageService(request.databaseUser).getByProjectId(request.params.projectId)
        return reply.send(storages)
    })

    // Add storage to project
    fastify.post("/projects/:projectId/storages", async (request, reply) => {})

    // Update storage
    fastify.put("/projects/:projectId/storages/:storageId", async (request, reply) => {})

    // Delete storage
    fastify.delete<{ Params: { projectId: string; storageId: string } }>("/projects/:projectId/storages/:storageId", async (request, reply) => {
        await new StorageService(request.databaseUser).delete(request.params.storageId)
        return reply.status(204).send()
    })
}
