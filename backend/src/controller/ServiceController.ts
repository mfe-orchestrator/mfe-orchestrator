import { FastifyInstance } from "fastify"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import ProjectHeaderNotFoundError from "../errors/ProjectHeaderNotFoundError"
import RepositoryCreationService, { CreateRepositoryInput } from "../service/RepositoryCreationService"
import ServiceDeploymentService from "../service/ServiceDeploymentService"
import ServiceService from "../service/ServiceService"
import AuthenticationMethod from "../types/AuthenticationMethod"
import ServiceDTO from "../types/ServiceDTO"
import { getProjectIdFromRequest } from "../utils/requestUtils"

export default async function serviceController(fastify: FastifyInstance) {
    fastify.get("/services", async (request, reply) => {
        const projectId = getProjectIdFromRequest(request)
        if (!projectId) {
            throw new ProjectHeaderNotFoundError()
        }
        return reply.send(await new ServiceService(request.databaseUser).getByProjectId(projectId))
    })

    fastify.get<{ Params: { id: string } }>("/services/:id", async (request, reply) => {
        const service = await new ServiceService(request.databaseUser).getById(request.params.id)
        if (!service) {
            throw new EntityNotFoundError(request.params.id)
        }
        return reply.send(service)
    })

    fastify.get<{ Params: { id: string } }>("/services/:id/versions", async (request, reply) => {
        return reply.send(await new ServiceService(request.databaseUser).getVersionsById(request.params.id))
    })

    fastify.post<{ Body: ServiceDTO }>("/services", async (request, reply) => {
        const projectId = getProjectIdFromRequest(request)
        if (!projectId) {
            throw new ProjectHeaderNotFoundError()
        }
        return reply.send(await new ServiceService(request.databaseUser).create(request.body, projectId))
    })

    fastify.put<{ Params: { id: string }; Body: ServiceDTO }>("/services/:id", async (request, reply) => {
        return reply.send(await new ServiceService(request.databaseUser).update(request.params.id, request.body))
    })

    fastify.delete<{ Params: { id: string } }>("/services/:id", async (request, reply) => {
        return reply.send(await new ServiceService(request.databaseUser).delete(request.params.id))
    })

    fastify.post<{ Params: { id: string }; Body: { version: string; branch?: string } }>("/services/:id/build", async (request, reply) => {
        return reply.send(await new ServiceService(request.databaseUser).build(request.params.id, request.body.version, request.body.branch))
    })

    // A new repository, scaffolded from a template, for a service that has none: the domain AI workspace offers it
    fastify.post<{ Params: { id: string }; Body: CreateRepositoryInput }>("/services/:id/repository", async (request, reply) => {
        return reply.send(await new RepositoryCreationService(request.databaseUser).createServiceRepository(request.params.id, request.body))
    })

    // Called by the release pipeline of the service with its deploy secret: the API key resolves the project,
    // and its role is checked by the service (MANAGER only)
    fastify.post<{
        Params: { serviceSlug: string; version: string }
        Body: unknown
    }>("/services/by-slug/:serviceSlug/versions/:version", { config: { authMethod: AuthenticationMethod.API_KEY } }, async (request, reply) => {
        const projectId = getProjectIdFromRequest(request)
        if (!projectId) {
            throw new ProjectHeaderNotFoundError()
        }
        return reply.send(await new ServiceService().registerVersionWithPermissionCheck(request.params.serviceSlug, request.params.version, projectId, request.body, request.apiKeyRole))
    })

    // Called by the deploy pipeline of the customer once a version runs in an environment: the orchestrator
    // does not deploy services, so this is how it learns which version each environment runs (MANAGER only)
    fastify.post<{
        Params: { serviceSlug: string; environmentSlug: string }
        Body: unknown
    }>("/services/by-slug/:serviceSlug/environments/:environmentSlug/deployments", { config: { authMethod: AuthenticationMethod.API_KEY } }, async (request, reply) => {
        const projectId = getProjectIdFromRequest(request)
        if (!projectId) {
            throw new ProjectHeaderNotFoundError()
        }
        return reply.send(await new ServiceDeploymentService().registerWithPermissionCheck(request.params.serviceSlug, request.params.environmentSlug, projectId, request.body, request.apiKeyRole))
    })
}
