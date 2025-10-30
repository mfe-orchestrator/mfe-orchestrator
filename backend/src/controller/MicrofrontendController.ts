import { FastifyInstance } from "fastify"
import MicrofrontendDTO from "../types/MicrofrontendDTO"
import MicrofrontendService from "../service/MicrofrontendService"
import { getProjectIdFromRequest } from "../utils/requestUtils"
import ProjectHeaderNotFoundError from "../errors/ProjectHeaderNotFoundError"
import AuthenticationMethod from "../types/AuthenticationMethod"

export default async function microfrontendController(fastify: FastifyInstance) {
    fastify.get("/microfrontends", async (request, reply) => {
        const projectId = getProjectIdFromRequest(request)
        if (!projectId) {
            throw new ProjectHeaderNotFoundError()
        }
        return reply.send(await new MicrofrontendService(request.databaseUser).getByProjectId(projectId))
    })

    fastify.get<{
        Params: {
            id: string
        }
    }>("/microfrontends/:id", async (request, reply) => {
        return reply.send(await new MicrofrontendService(request.databaseUser).getById(request.params.id))
    })

    fastify.get<{
        Params: {
            id: string
        }
    }>("/microfrontends/:id/versions", async (request, reply) => {
        return reply.send(await new MicrofrontendService(request.databaseUser).getVersionsById(request.params.id))
    })

    fastify.post<{
        Body: MicrofrontendDTO
    }>("/microfrontends", async (request, reply) => {
        const projectId = getProjectIdFromRequest(request)
        if (!projectId) {
            throw new ProjectHeaderNotFoundError()
        }
        return reply.send(await new MicrofrontendService(request.databaseUser).create(request.body, projectId))
    })

    fastify.put<{ Params: { id: string }; Body: MicrofrontendDTO }>("/microfrontends/:id", async (request, reply) => {
        return reply.send(await new MicrofrontendService(request.databaseUser).update(request.params.id, request.body))
    })

    fastify.delete<{ Params: { id: string } }>("/microfrontends/:id", async (request, reply) => {
        return reply.send(await new MicrofrontendService(request.databaseUser).delete(request.params.id))
    })

    fastify.delete<{ Body: string[] }>("/microfrontends", async (request, reply) => {
        return reply.send({
            message: "Microfrontends deleted successfully",
            deletedCount: await new MicrofrontendService(request.databaseUser).bulkDelete(request.body)
        })
    })

    fastify.post<{
        Params: { microfrontendSlug: string; version: string }
        Body: { file: string }
    }>("/microfrontends/by-slug/:microfrontendSlug/upload/:version", { config: { authMethod: AuthenticationMethod.API_KEY } }, async (request, reply) => {
        const projectId = getProjectIdFromRequest(request)
        if (!projectId) {
            throw new ProjectHeaderNotFoundError()
        }
        const data = await request.file()
        if (!data) {
            throw new Error("File not found")
        }
        return reply.send(await new MicrofrontendService().uploadWithPermissionCheck(request.params.microfrontendSlug, request.params.version, projectId, data))
    })

    fastify.put<{
        Body: {
            remote: string
            host: string
        }
    }>("/microfrontends/relation", async (request, reply) => {
        return reply.send(await new MicrofrontendService(request.databaseUser).setRelation(request.body.host, request.body.remote))
    })

    fastify.delete<{
        Body: {
            remote: string
            host: string
        }
    }>("/microfrontends/relation", async (request, reply) => {
        return reply.send(await new MicrofrontendService(request.databaseUser).deleteRelation(request.body.host, request.body.remote))
    })

    fastify.post<{
        Params: {
            id: string
        },
        Body: {
            version: string
            branch?: string
        }
    }>("/microfrontends/:id/build", async (request, reply) => {
        return reply.send(await new MicrofrontendService(request.databaseUser).build(request.params.id, request.body.version, request.body.branch))
    })

    fastify.put<{
        Params: {
            id: string
        },
        Body: {
            x: number
            y: number
        }
    }>("/microfrontends/:id/position", async (request, reply) => {
        return reply.send(await new MicrofrontendService(request.databaseUser).setPosition(request.params.id, request.body.x, request.body.y))
    })

    fastify.put<{
        Params: {
            id: string
        },
        Body: {
            width: number
            height: number
        }
    }>("/microfrontends/:id/dimension", async (request, reply) => {
        return reply.send(await new MicrofrontendService(request.databaseUser).setDimension(request.params.id, request.body.width, request.body.height))
    })


}
