import { FastifyInstance } from "fastify"
import { Types } from "mongoose"
import { BusinessException } from "../errors/BusinessException"
import ProjectHeaderNotFoundError from "../errors/ProjectHeaderNotFoundError"
import UserOrganization, { ORGANIZATION_ADMIN_ROLES } from "../models/UserOrganizationModel"
import UserProject, { IUserProject, RoleInProject } from "../models/UserProjectModel"
import UserProjectService, { PROJECT_LAST_OWNER } from "../service/UserProjectService"
import AuthenticationMethod from "../types/AuthenticationMethod"

interface PopulatedProject {
    _id: Types.ObjectId
    name: string
    description?: string
    organizationId?: Types.ObjectId
}

interface UserProjectWithProject extends Omit<IUserProject, "projectId"> {
    projectId: PopulatedProject
    createdAt: Date
    updatedAt: Date
}

interface AddUserToProjectDTO {
    email: string
    role: RoleInProject
    /** The domains the member is confined to; left out or empty, the whole project. */
    domainIds?: string[]
}

interface UpdateUserRoleDTO {
    role: RoleInProject
    /** Replaces the domain scope when given, an empty list opening the whole project; left out, it stays. */
    domainIds?: string[]
}

interface AcceptInvitationDTO {
    password?: string
    name?: string
    surname?: string
}

export default async function projectUserController(fastify: FastifyInstance) {
    // Get all users in a project

    fastify.get<{ Params: { projectId: string } }>("/projects/:projectId/users", async (request, reply) => {
        const projectId = request.params.projectId
        if (!projectId) {
            throw new ProjectHeaderNotFoundError()
        }
        return reply.send(await new UserProjectService(request.databaseUser).getProjectUsers(projectId))
    })

    // Add a user to a project
    fastify.post<{
        Params: { projectId: string }
        Body: AddUserToProjectDTO
    }>("/projects/:projectId/users", async (request, reply) => {
        const { projectId } = request.params
        if (!projectId) {
            throw new ProjectHeaderNotFoundError()
        }
        const { email, role, domainIds } = request.body

        reply.send(await new UserProjectService(request.databaseUser).addUserToProjectByEmail(projectId, email, role, domainIds))
    })

    // Resend a pending invitation email
    fastify.post<{ Params: { projectId: string; userId: string } }>("/projects/:projectId/users/:userId/resend-invitation", async (request, reply) => {
        const { projectId, userId } = request.params
        if (!projectId) {
            throw new ProjectHeaderNotFoundError()
        }
        return reply.send(await new UserProjectService(request.databaseUser).resendInvitation(projectId, userId))
    })

    // Public: read invitation details by token (used by the acceptance page)
    fastify.get<{ Params: { token: string } }>("/projects/invitations/:token", { config: { authMethod: AuthenticationMethod.PUBLIC } }, async (request, reply) => {
        return reply.send(await new UserProjectService().getInvitationByToken(request.params.token))
    })

    // Public: accept an invitation by token
    fastify.post<{
        Params: { token: string }
        Body: AcceptInvitationDTO
    }>("/projects/invitations/:token/accept", { config: { authMethod: AuthenticationMethod.PUBLIC } }, async (request, reply) => {
        return reply.send(await new UserProjectService().acceptInvitation(request.params.token, request.body || {}))
    })

    // Update a user's role in a project
    fastify.put<{
        Params: {
            projectId: string
            userId: string
        }
        Body: UpdateUserRoleDTO
    }>("/projects/:projectId/users/:userId", async (request, reply) => {
        const { projectId, userId } = request.params
        const userProject = await new UserProjectService(request.databaseUser).updateUserRole(projectId, userId, request.body.role, request.body.domainIds)
        return reply.send({
            message: "User role updated successfully",
            userProject
        })
    })

    // Remove user from project
    fastify.delete<{ Params: { projectId: string; userId: string } }>("/projects/:projectId/users/:userId", async (request, reply) => {
        const { projectId, userId } = request.params
        try {
            await new UserProjectService(request.databaseUser).removeUserFromProject(projectId, userId)
        } catch (error) {
            // The console shows `message` of this answer as it is: the last-owner refusal keeps that shape.
            if (error instanceof BusinessException && error.code === PROJECT_LAST_OWNER) {
                return reply.status(400).send({ message: error.message })
            }
            throw error
        }
        return reply.status(204).send()
    })

    // Invitations waiting for an answer from the current user
    fastify.get("/users/me/invitations", async (request, reply) => {
        return reply.send(await new UserProjectService(request.databaseUser).getMyPendingInvitations())
    })

    // Accept an invitation from inside the app
    fastify.post<{ Params: { projectId: string } }>("/users/me/invitations/:projectId/accept", async (request, reply) => {
        return reply.send(await new UserProjectService(request.databaseUser).acceptMyInvitation(request.params.projectId))
    })

    // Decline an invitation from inside the app
    fastify.delete<{ Params: { projectId: string } }>("/users/me/invitations/:projectId", async (request, reply) => {
        await new UserProjectService(request.databaseUser).declineMyInvitation(request.params.projectId)
        return reply.status(204).send()
    })

    // Get all projects for the current user
    fastify.get("/users/me/projects", async (request, reply) => {
        const userId = request.databaseUser._id

        // Pending invitations are not memberships yet, so they are left out
        const userProjects = (await UserProject.find({ userId, invitationToken: null }).populate<{
            projectId: PopulatedProject
        }>("projectId", "name description organizationId")) as unknown as UserProjectWithProject[]

        // An owner reaches their project whole, and an organization administrator every project of it, whatever
        // the membership says: the organizations are read only when some membership is scoped, which most users have none of
        const administered = userProjects.some(up => up.domainScoped)
            ? new Set(
                  (await UserOrganization.find({ userId, role: { $in: ORGANIZATION_ADMIN_ROLES }, invitationToken: null }, { organizationId: 1 })).map(membership => String(membership.organizationId))
              )
            : new Set<string>()

        const projects = userProjects.map(up => {
            const domainScoped = Boolean(up.domainScoped) && up.role !== RoleInProject.OWNER && !administered.has(String(up.projectId.organizationId))
            return {
                projectId: up.projectId._id,
                name: up.projectId.name,
                description: up.projectId.description,
                role: up.role,
                domainIds: domainScoped ? (up.domainIds ?? []).map(String) : [],
                domainScoped,
                joinedAt: up.createdAt
            }
        })

        return reply.send(projects)
    })
}
