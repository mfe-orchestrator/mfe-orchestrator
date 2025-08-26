import { ClientSession, ObjectId, Types } from "mongoose"
import UserProject, { IUserProject } from "../models/UserProjectModel"
import { RoleInProject } from "../models/UserProjectModel"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import Project from "../models/ProjectModel"
import BaseAuthorizedService from "./BaseAuthorizedService"
import { IUser, UserStatus } from "../models/UserModel"
import User from "../models/UserModel"

import UserService from "../service/UserService"
import { randomBytes } from "crypto"
import EmailSenderService from "./EmailSenderService"
// Get all user-project relationships for this project
interface IUserInProject extends Partial<IUser> {
    joinedAt: Date
    role: RoleInProject
}
class UserProjectService extends BaseAuthorizedService {
    emailSenderService = new EmailSenderService()
    userService = new UserService()

    async addUserToProjectByEmail(projectId: string | ObjectId, email: string, role: RoleInProject): Promise<IUserProject | undefined> {
        const projectIdObj = typeof projectId === "string" ? new Types.ObjectId(projectId) : projectId
        const project = await Project.findById(projectIdObj)
        if (!project) {
            throw new EntityNotFoundError(projectIdObj.toString())
        }

        // Find user by email
        const user = await User.findOne({ email })
        if (user) {
            return (await this.addUserToProject(user._id, projectId, role)).userProject
        }
        // qui devo assolutamente inviatre l'utente
        const registeredUser = await this.userService.register(
            {
                email,
                status: UserStatus.INVITED
            },
            false
        )

        const canSendEmail = this.emailSenderService.canSendEmails()

        // Add user to project
        const userProject = new UserProject({
            userId: registeredUser._id,
            projectId: projectIdObj,
            role,
            invitationToken: canSendEmail ? randomBytes(32).toString("hex") : undefined
        })

        const out = await userProject.save()

        if (canSendEmail) await this.emailSenderService.sendUserInvitationEmail(registeredUser, project, role, userProject.invitationToken)

        return out
    }

    async addUserToProject(userId: string | ObjectId, projectId: string | ObjectId, role: RoleInProject, session?: ClientSession) {
        // Convert string IDs to ObjectId if needed
        const userIdObj = typeof userId === "string" ? new Types.ObjectId(userId) : userId
        const projectIdObj = typeof projectId === "string" ? new Types.ObjectId(projectId) : projectId

        // Verify project exists
        const project = await Project.findById(projectIdObj)
        if (!project) {
            throw new EntityNotFoundError(projectIdObj.toString())
        }

        // Verify user exists
        const user = await User.findById(userIdObj)
        if (!user) {
            throw new EntityNotFoundError(`User with ID ${userIdObj} not found`)
        }

        // Check if user is already in the project
        const existingUserProject = await UserProject.findOne({
            userId: userIdObj,
            projectId: projectIdObj
        })

        if (existingUserProject) {
            return {
                alreadyExists: true,
                role: existingUserProject.role
            }
        }

        // Add user to project
        const userProject = new UserProject({
            userId: userIdObj,
            projectId: projectIdObj,
            role
        })

        const savedUserProject = await userProject.save({ session })
        return {
            alreadyExists: false,
            userProject: savedUserProject
        }
    }

    async getProjectUsers(projectId: string | ObjectId): Promise<IUserInProject[] | undefined> {
        // Verify project exists
        const project = await Project.findById(projectId)
        if (!project) {
            throw new EntityNotFoundError(projectId.toString())
        }

        type PopulatedUserProject = IUserProject & {
            user: IUser
        }

        const userProjects = await UserProject.find({ projectId }).populate<{ user: IUser }>("userId", "email name surname").lean<PopulatedUserProject[]>()

        // Format the response
        return userProjects.map<IUserInProject>(up => {
            return {
                ...up.user,
                role: up.role,
                joinedAt: up.createdAt
            }
        })
    }
}

export default UserProjectService
