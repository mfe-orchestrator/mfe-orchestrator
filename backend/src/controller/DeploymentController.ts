import { FastifyInstance } from "fastify"
import DeploymentService from "../service/DeploymentService"
import { DeploymentDTO } from "../types/DeploymentDTO"
import DeploymentCanaryUsersService from "../service/DeploymentCanaryUsersService"

export default async function deploymentController(fastify: FastifyInstance) {
    fastify.post<{ Body: DeploymentDTO }>("/deployment", async (request, reply) => {
        const deployment = await new DeploymentService(request.databaseUser).createMultiple(request.body.environmentIds)
        reply.send(deployment)
    })
}
