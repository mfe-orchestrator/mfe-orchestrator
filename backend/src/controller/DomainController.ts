import { FastifyInstance } from "fastify"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import ProjectHeaderNotFoundError from "../errors/ProjectHeaderNotFoundError"
import DomainService from "../service/DomainService"
import DomainDTO, { DomainMembersDTO } from "../types/DomainDTO"
import { getProjectIdFromRequest } from "../utils/requestUtils"

export default async function domainController(fastify: FastifyInstance) {
    fastify.get("/domains", async (request, reply) => {
        const projectId = getProjectIdFromRequest(request)
        if (!projectId) {
            throw new ProjectHeaderNotFoundError()
        }
        return reply.send(await new DomainService(request.databaseUser).getByProjectId(projectId))
    })

    fastify.get<{ Params: { id: string } }>("/domains/:id", async (request, reply) => {
        const domain = await new DomainService(request.databaseUser).getById(request.params.id)
        if (!domain) {
            throw new EntityNotFoundError(request.params.id)
        }
        return reply.send(domain)
    })

    fastify.post<{ Body: DomainDTO }>("/domains", async (request, reply) => {
        const projectId = getProjectIdFromRequest(request)
        if (!projectId) {
            throw new ProjectHeaderNotFoundError()
        }
        return reply.send(await new DomainService(request.databaseUser).create(request.body, projectId))
    })

    fastify.put<{ Params: { id: string }; Body: DomainDTO }>("/domains/:id", async (request, reply) => {
        return reply.send(await new DomainService(request.databaseUser).update(request.params.id, request.body))
    })

    fastify.post<{ Params: { id: string }; Body: DomainMembersDTO }>("/domains/:id/members", async (request, reply) => {
        return reply.send(await new DomainService(request.databaseUser).addMembers(request.params.id, request.body))
    })

    fastify.delete<{ Params: { id: string } }>("/domains/:id", async (request, reply) => {
        return reply.send(await new DomainService(request.databaseUser).delete(request.params.id))
    })
}
