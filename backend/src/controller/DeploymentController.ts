import { FastifyInstance } from "fastify"
import { createDeploymentSchema, deploymentIdSchema } from "../schemas/deployment.schema"
import DeploymentService from "../service/DeploymentService"
import { DeploymentDTO } from "../types/DeploymentDTO"

export default async function deploymentController(fastify: FastifyInstance) {
    fastify.post<{ Body: DeploymentDTO }>("/deployment", { schema: createDeploymentSchema }, async (request, reply) => {
        reply.send(await new DeploymentService(request.databaseUser).createMultiple(request.body.environmentIds))
    })

    fastify.post<{ Params: { deploymentId: string } }>("/deployment/:deploymentId/redeployment", { schema: deploymentIdSchema }, async (request, reply) => {
        reply.send(await new DeploymentService(request.databaseUser).redeploy(request.params.deploymentId))
    })
}
