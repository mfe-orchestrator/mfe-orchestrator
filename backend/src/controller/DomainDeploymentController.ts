import { FastifyInstance } from "fastify"
import ProjectHeaderNotFoundError from "../errors/ProjectHeaderNotFoundError"
import DomainDeploymentService from "../service/DomainDeploymentService"
import { getProjectIdFromRequest } from "../utils/requestUtils"

/**
 * Which frontend and backend versions each environment runs, by functional domain. A static segment
 * wins over a parameter in the router, so `/domains/deployments` is never read as the domain "deployments".
 */
export default async function domainDeploymentController(fastify: FastifyInstance) {
    fastify.get("/domains/deployments", async (request, reply) => {
        const projectId = getProjectIdFromRequest(request)
        if (!projectId) {
            throw new ProjectHeaderNotFoundError()
        }
        return reply.send(await new DomainDeploymentService(request.databaseUser).getByProjectId(projectId))
    })

    fastify.get<{ Params: { id: string } }>("/domains/:id/deployments", async (request, reply) => {
        return reply.send(await new DomainDeploymentService(request.databaseUser).getByDomainId(request.params.id))
    })
}
