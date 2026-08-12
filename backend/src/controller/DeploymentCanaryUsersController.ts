import { FastifyInstance } from "fastify"
import { deleteCanaryUsersSchema, deploymentIdSchema, setCanaryUsersSchema } from "../schemas/deployment.schema"
import DeploymentCanaryUsersService from "../service/DeploymentCanaryUsersService"
import { DeploymentCanaryUsersDTO } from "../types/DeploymentCanaryUsersDTO"

export default async function deploymentController(fastify: FastifyInstance) {
    fastify.get<{ Params: { deploymentId: string } }>("/deployment/:deploymentId/canary-users", { schema: deploymentIdSchema }, async (request, reply) => {
        const canaryUsers = await new DeploymentCanaryUsersService(request.databaseUser).getCanaryUsersByDeploymentWithPermissionCheck(request.params.deploymentId)
        reply.send(canaryUsers)
    })

    fastify.post<{ Params: { deploymentId: string }; Body: DeploymentCanaryUsersDTO }>("/deployment/:deploymentId/canary-users", { schema: setCanaryUsersSchema }, async (request, reply) => {
        const canaryUsers = await new DeploymentCanaryUsersService(request.databaseUser).setCanaryUserMultipleWithPermissionCheck(
            request.params.deploymentId,
            request.body.userIds,
            request.body.enabled
        )
        reply.send(canaryUsers)
    })

    fastify.delete<{ Params: { deploymentId: string }; Body: string[] }>("/deployment/:deploymentId/canary-users", { schema: deleteCanaryUsersSchema }, async (request, reply) => {
        const canaryUsers = await new DeploymentCanaryUsersService(request.databaseUser).deleteCanaryUsersWithPermissionCheck(request.params.deploymentId, request.body)
        reply.send(canaryUsers)
    })
}
