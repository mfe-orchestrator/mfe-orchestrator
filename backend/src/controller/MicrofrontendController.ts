import fastifyMultipart from "@fastify/multipart"
import { FastifyInstance } from "fastify"
import ProjectHeaderNotFoundError from "../errors/ProjectHeaderNotFoundError"
import {
    buildMicrofrontendSchema,
    bulkDeleteMicrofrontendsSchema,
    createMicrofrontendSchema,
    microfrontendIdSchema,
    relationSchema,
    setDimensionSchema,
    setPositionSchema,
    setStackSchema,
    updateMicrofrontendSchema,
    uploadMicrofrontendSchema
} from "../schemas/microfrontend.schema"
import MicrofrontendService from "../service/MicrofrontendService"
import StackDetectionService from "../service/StackDetectionService"
import AuthenticationMethod from "../types/AuthenticationMethod"
import MicrofrontendDTO from "../types/MicrofrontendDTO"
import { getProjectIdFromRequest } from "../utils/requestUtils"

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
    }>("/microfrontends/:id", { schema: microfrontendIdSchema }, async (request, reply) => {
        return reply.send(await new MicrofrontendService(request.databaseUser).getById(request.params.id))
    })

    fastify.get<{
        Params: {
            id: string
        }
    }>("/microfrontends/:id/versions", { schema: microfrontendIdSchema }, async (request, reply) => {
        return reply.send(await new MicrofrontendService(request.databaseUser).getVersionsById(request.params.id))
    })

    fastify.post<{
        Body: MicrofrontendDTO
    }>("/microfrontends", { schema: createMicrofrontendSchema }, async (request, reply) => {
        const projectId = getProjectIdFromRequest(request)
        if (!projectId) {
            throw new ProjectHeaderNotFoundError()
        }
        return reply.send(await new MicrofrontendService(request.databaseUser).create(request.body, projectId))
    })

    fastify.put<{ Params: { id: string }; Body: MicrofrontendDTO }>("/microfrontends/:id", { schema: updateMicrofrontendSchema }, async (request, reply) => {
        return reply.send(await new MicrofrontendService(request.databaseUser).update(request.params.id, request.body))
    })

    fastify.delete<{ Params: { id: string } }>("/microfrontends/:id", { schema: microfrontendIdSchema }, async (request, reply) => {
        return reply.send(await new MicrofrontendService(request.databaseUser).delete(request.params.id))
    })

    fastify.delete<{ Body: string[] }>("/microfrontends", { schema: bulkDeleteMicrofrontendsSchema }, async (request, reply) => {
        return reply.send({
            message: "Microfrontends deleted successfully",
            deletedCount: await new MicrofrontendService(request.databaseUser).bulkDelete(request.body)
        })
    })

    fastify.post("/microfrontends/stack-detection", async (request, reply) => {
        const projectId = getProjectIdFromRequest(request)
        if (!projectId) {
            throw new ProjectHeaderNotFoundError()
        }
        return reply.send(await new StackDetectionService(request.databaseUser).detectForProject(projectId))
    })

    fastify.put<{
        Params: { id: string }
        Body: { framework?: string; compiler?: string }
    }>("/microfrontends/:id/stack", { schema: setStackSchema }, async (request, reply) => {
        return reply.send(await new StackDetectionService(request.databaseUser).setManualStack(request.params.id, request.body.framework, request.body.compiler))
    })

    // Encapsulated scope: the multipart parser stays local to the upload route, so every
    // other endpoint keeps accepting JSON only.
    await fastify.register(async uploadScope => {
        await uploadScope.register(fastifyMultipart)

        uploadScope.post<{
            Params: { microfrontendSlug: string; version: string }
            Body: { file: string }
        }>("/microfrontends/by-slug/:microfrontendSlug/upload/:version", { config: { authMethod: AuthenticationMethod.API_KEY }, schema: uploadMicrofrontendSchema }, async (request, reply) => {
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
    })

    fastify.put<{
        Body: {
            remote: string
            host: string
        }
    }>("/microfrontends/relation", { schema: relationSchema }, async (request, reply) => {
        return reply.send(await new MicrofrontendService(request.databaseUser).setRelation(request.body.host, request.body.remote))
    })

    fastify.delete<{
        Body: {
            remote: string
            host: string
        }
    }>("/microfrontends/relation", { schema: relationSchema }, async (request, reply) => {
        return reply.send(await new MicrofrontendService(request.databaseUser).deleteRelation(request.body.host, request.body.remote))
    })

    fastify.post<{
        Params: {
            id: string
        }
        Body: {
            version: string
            branch?: string
        }
    }>("/microfrontends/:id/build", { schema: buildMicrofrontendSchema }, async (request, reply) => {
        return reply.send(await new MicrofrontendService(request.databaseUser).build(request.params.id, request.body.version, request.body.branch))
    })

    fastify.put<{
        Params: {
            id: string
        }
        Body: {
            x: number
            y: number
        }
    }>("/microfrontends/:id/position", { schema: setPositionSchema }, async (request, reply) => {
        return reply.send(await new MicrofrontendService(request.databaseUser).setPosition(request.params.id, request.body.x, request.body.y))
    })

    fastify.put<{
        Params: {
            id: string
        }
        Body: {
            width: number
            height: number
        }
    }>("/microfrontends/:id/dimension", { schema: setDimensionSchema }, async (request, reply) => {
        return reply.send(await new MicrofrontendService(request.databaseUser).setDimension(request.params.id, request.body.width, request.body.height))
    })
}
