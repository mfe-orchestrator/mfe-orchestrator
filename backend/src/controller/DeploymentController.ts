import { FastifyInstance } from "fastify"
import DeploymentService from "../service/DeploymentService"
import { DeploymentDTO } from "../types/DeploymentDTO"

export default async function deploymentController(fastify: FastifyInstance) {
    fastify.post<{ Body: DeploymentDTO }>("/deployment", async (request, reply) => {
        reply.send(await new DeploymentService(request.databaseUser).createMultiple(request.body.environmentIds))
    })

    fastify.post<{ Params: { deploymentId: string } }>("/deployment/:deploymentId/redeployment", async (request, reply) => {
        reply.send(await new DeploymentService(request.databaseUser).redeploy(request.params.deploymentId))
    })
}
