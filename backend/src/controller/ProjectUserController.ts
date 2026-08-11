import { FastifyInstance } from "fastify"
import { Types } from "mongoose"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import ProjectHeaderNotFoundError from "../errors/ProjectHeaderNotFoundError"
import Project from "../models/ProjectModel"
import User, { UserStatus } from "../models/UserModel"
import UserProject, { IUserProject, RoleInProject } from "../models/UserProjectModel"
import UserProjectService from "../service/UserProjectService"
import AuthenticationMethod from "../types/AuthenticationMethod"
import { toObjectId } from "../utils/mongooseUtils"

interface PopulatedProject {
    _id: Types.ObjectId
    name: string
    description?: string
}

interface UserProjectWithProject extends Omit<IUserProject, "projectId"> {
    projectId: PopulatedProject
    createdAt: Date
    updatedAt: Date
}

interface AddUserToProjectDTO {
    email: string
    role: RoleInProject
}

interface UpdateUserRoleDTO {
    role: RoleInProject
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
        const { email, role } = request.body

        reply.send(await new UserProjectService(request.databaseUser).addUserToProjectByEmail(projectId, email, role))
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
        const { role } = request.body

        // Verify project exists
        const project = await Project.findById(projectId)
        if (!project) {
            throw new EntityNotFoundError(projectId)
        }

        // Verify user exists
        const user = await User.findById(new Types.ObjectId(userId))
        if (!user) {
            throw new EntityNotFoundError(`User with ID ${userId} not found`)
        }

        // Find and update the user's role in the project
        const userProject = await UserProject.findOneAndUpdate(
            {
                userId: toObjectId(userId),
                projectId: toObjectId(projectId)
            },
            { role },
            { new: true }
        )

        if (!userProject) {
            throw new EntityNotFoundError("User is not a member of this project")
        }

        return reply.send({
            message: "User role updated successfully",
            userProject
        })
    })

    // Remove user from project
    fastify.delete<{ Params: { projectId: string; userId: string } }>("/projects/:projectId/users/:userId", async (request, reply) => {
        const { projectId, userId } = request.params

        // Verify project exists
        const project = await Project.findById(projectId)
        if (!project) {
            throw new EntityNotFoundError(projectId)
        }

        // Verify user exists
        const user = await User.findById(toObjectId(userId))
        if (!user) {
            throw new EntityNotFoundError(`User with ID ${userId} not found`)
        }

        // Prevent removing the last owner
        const ownerCount = await UserProject.countDocuments({
            projectId: toObjectId(projectId),
            role: RoleInProject.OWNER
        })

        const userToRemove = await UserProject.findOne({
            userId: toObjectId(userId),
            projectId: toObjectId(projectId),
            role: RoleInProject.OWNER
        })

        if (userToRemove && ownerCount <= 1) {
            return reply.status(400).send({
                message: "Cannot remove the last owner of the project. Please assign another owner first."
            })
        }

        // Remove user from project
        const result = await UserProject.findOneAndDelete({
            userId: toObjectId(userId),
            projectId: toObjectId(projectId)
        })

        if (!result) {
            throw new EntityNotFoundError("User is not a member of this project")
        }

        // Clean up users that were only created to be invited and never accepted
        if (user.status === UserStatus.INVITED) {
            const remaining = await UserProject.countDocuments({ userId: toObjectId(userId) })
            if (remaining === 0) {
                await User.findByIdAndDelete(toObjectId(userId))
            }
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
        }>("projectId", "name description")) as unknown as UserProjectWithProject[]

        const projects = userProjects.map(up => ({
            projectId: up.projectId._id,
            name: up.projectId.name,
            description: up.projectId.description,
            role: up.role,
            joinedAt: up.createdAt
        }))

        return reply.send(projects)
    })
}
