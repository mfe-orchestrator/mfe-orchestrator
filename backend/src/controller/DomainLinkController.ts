import { FastifyInstance } from "fastify"
import ProjectHeaderNotFoundError from "../errors/ProjectHeaderNotFoundError"
import DomainLinkService from "../service/DomainLinkService"
import DomainLinkDTO from "../types/DomainLinkDTO"
import { getProjectIdFromRequest } from "../utils/requestUtils"

export default async function domainLinkController(fastify: FastifyInstance) {
    fastify.get("/domain-links", async (request, reply) => {
        const projectId = getProjectIdFromRequest(request)
        if (!projectId) {
            throw new ProjectHeaderNotFoundError()
        }
        return reply.send(await new DomainLinkService(request.databaseUser).getByProjectId(projectId))
    })

    fastify.post<{ Body: DomainLinkDTO }>("/domain-links", async (request, reply) => {
        const projectId = getProjectIdFromRequest(request)
        if (!projectId) {
            throw new ProjectHeaderNotFoundError()
        }
        return reply.send(await new DomainLinkService(request.databaseUser).create(request.body, projectId))
    })

    fastify.delete<{ Params: { id: string } }>("/domain-links/:id", async (request, reply) => {
        return reply.send(await new DomainLinkService(request.databaseUser).delete(request.params.id))
    })
}
