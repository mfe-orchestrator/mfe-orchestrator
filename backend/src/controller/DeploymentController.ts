import { FastifyInstance } from "fastify"
import DeploymentService from "../service/DeploymentService"
import { DeploymentDTO } from "../types/DeploymentDTO"

export default async function deploymentController(fastify: FastifyInstance) {
    fastify.post<{ Body: DeploymentDTO }>("/deployment", async (request, reply) => {
        const deployment = await new DeploymentService(request.databaseUser).createMultiple(request.body.environmentIds)
        reply.send(deployment)
    })

    fastify.get("/deployment/:deploymentId/canary-users", async (request, reply) => {
        reply.send("TODO to be implemented")
    })

    fastify.post("/deployment/:deploymentId/canary-users", async (request, reply) => {
        reply.send("TODO to be implemented")
    })
}
