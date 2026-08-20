import { FastifyInstance } from "fastify"
import { RoleInOrganization } from "../models/UserOrganizationModel"
import UserOrganizationService from "../service/UserOrganizationService"
import AuthenticationMethod from "../types/AuthenticationMethod"

interface AddUserToOrganizationDTO {
    email: string
    role: RoleInOrganization
}

interface UpdateUserRoleDTO {
    role: RoleInOrganization
}

interface AcceptInvitationDTO {
    password?: string
    name?: string
    surname?: string
}

export default async function organizationUserController(fastify: FastifyInstance) {
    fastify.get<{ Params: { organizationId: string } }>("/organizations/:organizationId/users", async (request, reply) => {
        return reply.send(await new UserOrganizationService(request.databaseUser).getOrganizationUsers(request.params.organizationId))
    })

    fastify.post<{ Params: { organizationId: string }; Body: AddUserToOrganizationDTO }>("/organizations/:organizationId/users", async (request, reply) => {
        const { email, role } = request.body
        return reply.send(await new UserOrganizationService(request.databaseUser).addUserToOrganizationByEmail(request.params.organizationId, email, role))
    })

    fastify.put<{ Params: { organizationId: string; userId: string }; Body: UpdateUserRoleDTO }>("/organizations/:organizationId/users/:userId", async (request, reply) => {
        const { organizationId, userId } = request.params
        return reply.send(await new UserOrganizationService(request.databaseUser).updateRole(organizationId, userId, request.body.role))
    })

    fastify.delete<{ Params: { organizationId: string; userId: string } }>("/organizations/:organizationId/users/:userId", async (request, reply) => {
        const { organizationId, userId } = request.params
        await new UserOrganizationService(request.databaseUser).removeUser(organizationId, userId)
        return reply.status(204).send()
    })

    fastify.post<{ Params: { organizationId: string; userId: string } }>("/organizations/:organizationId/users/:userId/resend-invitation", async (request, reply) => {
        const { organizationId, userId } = request.params
        return reply.send(await new UserOrganizationService(request.databaseUser).resendInvitation(organizationId, userId))
    })

    // Public: read invitation details by token (used by the acceptance page)
    fastify.get<{ Params: { token: string } }>("/organizations/invitations/:token", { config: { authMethod: AuthenticationMethod.PUBLIC } }, async (request, reply) => {
        return reply.send(await new UserOrganizationService().getInvitationByToken(request.params.token))
    })

    // Public: accept an invitation by token
    fastify.post<{ Params: { token: string }; Body: AcceptInvitationDTO }>(
        "/organizations/invitations/:token/accept",
        { config: { authMethod: AuthenticationMethod.PUBLIC } },
        async (request, reply) => {
            return reply.send(await new UserOrganizationService().acceptInvitation(request.params.token, request.body || {}))
        }
    )

    // Organization invitations waiting for an answer from the current user
    fastify.get("/users/me/organization-invitations", async (request, reply) => {
        return reply.send(await new UserOrganizationService(request.databaseUser).getMyPendingInvitations())
    })

    fastify.post<{ Params: { organizationId: string } }>("/users/me/organization-invitations/:organizationId/accept", async (request, reply) => {
        return reply.send(await new UserOrganizationService(request.databaseUser).acceptMyInvitation(request.params.organizationId))
    })

    fastify.delete<{ Params: { organizationId: string } }>("/users/me/organization-invitations/:organizationId", async (request, reply) => {
        await new UserOrganizationService(request.databaseUser).declineMyInvitation(request.params.organizationId)
        return reply.status(204).send()
    })
}
