import { FastifyInstance } from "fastify"
import { Types } from "mongoose"
import User from "../models/UserModel"
import UserProject, { IUserProject, RoleInProject } from "../models/UserProjectModel"
import Project from "../models/ProjectModel"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import ProjectHeaderNotFoundError from "../errors/ProjectHeaderNotFoundError"
import UserProjectService from "../service/UserProjectService"

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
                userId: new Types.ObjectId(userId),
                projectId: new Types.ObjectId(projectId)
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
        const user = await User.findById(new Types.ObjectId(userId))
        if (!user) {
            throw new EntityNotFoundError(`User with ID ${userId} not found`)
        }

        // Prevent removing the last owner
        const ownerCount = await UserProject.countDocuments({
            projectId: new Types.ObjectId(projectId),
            role: RoleInProject.OWNER
        })

        const userToRemove = await UserProject.findOne({
            userId: new Types.ObjectId(userId),
            projectId: new Types.ObjectId(projectId),
            role: RoleInProject.OWNER
        })

        if (userToRemove && ownerCount <= 1) {
            return reply.status(400).send({
                message: "Cannot remove the last owner of the project. Please assign another owner first."
            })
        }

        // Remove user from project
        const result = await UserProject.findOneAndDelete({
            userId: new Types.ObjectId(userId),
            projectId: new Types.ObjectId(projectId)
        })

        if (!result) {
            throw new EntityNotFoundError("User is not a member of this project")
        }

        return reply.status(204).send()
    })

    // Get all projects for the current user
    fastify.get("/users/me/projects", async (request, reply) => {
        const userId = request.databaseUser._id

        const userProjects = (await UserProject.find({ userId }).populate<{ projectId: PopulatedProject }>("projectId", "name description").lean()) as unknown as UserProjectWithProject[]

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
