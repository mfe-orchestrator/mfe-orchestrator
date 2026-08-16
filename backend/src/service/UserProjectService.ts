import { randomBytes } from "crypto"
import { ClientSession, ObjectId, Schema } from "mongoose"
import { fastify } from ".."
import { createBusinessException } from "../errors/BusinessException"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import { ProjectNotFoundError } from "../errors/ProjectNotFoundError"
import Project, { IProject } from "../models/ProjectModel"
import User, { IUser, IUserDocument, UserStatus } from "../models/UserModel"
import UserProject, { IUserProject, RoleInProject } from "../models/UserProjectModel"
import UserService, { recordLogin } from "../service/UserService"
import { toObjectId } from "../utils/mongooseUtils"
import BaseAuthorizedService from "./BaseAuthorizedService"
import EmailSenderService from "./EmailSenderService"

const INVITATION_TTL_DAYS = 5
const INVITATION_TTL_MS = INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000

// Get all user-project relationships for this project
interface IUserInProject extends Partial<IUser> {
    joinedAt: Date
    role: RoleInProject
    invitationPending: boolean
    invitationExpiresAt?: Date
}

interface IInvitationInfo {
    projectName: string
    role: RoleInProject
    email: string
    needsPassword: boolean
}

interface IAcceptInvitationData {
    password?: string
    name?: string
    surname?: string
}

/** An invitation waiting for an answer from the signed-in user, as shown in the project switcher. */
interface IPendingInvitation {
    projectId: string
    projectName: string
    projectDescription?: string
    role: RoleInProject
    invitedAt: Date
    expiresAt?: Date
}
class UserProjectService extends BaseAuthorizedService {
    emailSenderService = new EmailSenderService()
    userService = new UserService()

    async addUserToProjectByEmail(projectId: string | Schema.Types.ObjectId, email: string, role: RoleInProject): Promise<IUserProject | undefined> {
        const projectIdObj = toObjectId(projectId)
        const project = await Project.findById(projectIdObj)
        if (!project) {
            throw new ProjectNotFoundError(projectIdObj.toString())
        }

        const canSendEmail = this.emailSenderService.canSendEmails()

        // Find or create the target user
        let user = await User.findOne({ email })
        if (!user) {
            fastify.log.info(`Inviting new user ${email} to project ${projectIdObj.toString()}`)
            user = await this.userService.register(
                {
                    email,
                    // Without an email channel we cannot deliver a confirmation link,
                    // so the account is created as ACTIVE and joins the project directly.
                    status: canSendEmail ? UserStatus.INVITED : UserStatus.ACTIVE
                },
                false
            )
        }

        // A user can only have one relationship per project
        const existing = await UserProject.findOne({ userId: toObjectId(user._id), projectId: projectIdObj })

        if (existing) {
            if (!existing.invitationToken) {
                throw createBusinessException({
                    code: "USER_ALREADY_IN_PROJECT",
                    message: "This user is already a member of the project"
                })
            }
            // Pending invite already exists: refresh it (acts as a re-invite)
            return this.regenerateInvitation(existing, user, project, role, canSendEmail)
        }

        // Without email delivery the invite cannot be confirmed, so join immediately
        if (!canSendEmail) {
            const userProject = new UserProject({ userId: user._id, projectId: projectIdObj, role })
            return userProject.save()
        }

        const userProject = new UserProject({
            userId: user._id,
            projectId: projectIdObj,
            role,
            invitationToken: randomBytes(32).toString("hex"),
            inviationTokenExpiresAt: new Date(Date.now() + INVITATION_TTL_MS)
        })

        const out = await userProject.save()
        await this.emailSenderService.sendUserInvitationEmail(user, project, role, userProject.invitationToken as string)
        return out
    }

    private async regenerateInvitation(userProject: IUserProject, user: IUser, project: IProject, role: RoleInProject, canSendEmail: boolean): Promise<IUserProject> {
        userProject.role = role
        if (canSendEmail) {
            userProject.invitationToken = randomBytes(32).toString("hex")
            userProject.inviationTokenExpiresAt = new Date(Date.now() + INVITATION_TTL_MS)
        }
        const out = await userProject.save()
        if (canSendEmail) {
            await this.emailSenderService.sendUserInvitationEmail(user, project, role, userProject.invitationToken as string)
        }
        return out
    }

    async getInvitationByToken(token: string): Promise<IInvitationInfo> {
        const userProject = await this.findValidInvitation(token)
        const project = await Project.findById(userProject.projectId)
        if (!project) {
            throw new ProjectNotFoundError(userProject.projectId.toString())
        }
        const user = await User.findById(userProject.userId)
        if (!user) {
            throw new EntityNotFoundError(userProject.userId.toString())
        }
        return {
            projectName: project.name,
            role: userProject.role,
            email: user.email,
            needsPassword: !user.password
        }
    }

    async acceptInvitation(token: string, data: IAcceptInvitationData) {
        const userProject = await this.findValidInvitation(token)
        const user = (await User.findById(userProject.userId)) as IUserDocument | null
        if (!user) {
            throw new EntityNotFoundError(userProject.userId.toString())
        }

        // New users must set a password to be able to sign in later
        if (!user.password) {
            if (!data.password || data.password.length < 8) {
                throw createBusinessException({
                    code: "PASSWORD_REQUIRED",
                    message: "A password of at least 8 characters is required to accept this invitation"
                })
            }
            user.password = data.password
            if (data.name) user.name = data.name
            if (data.surname) user.surname = data.surname
        }
        user.status = UserStatus.ACTIVE
        user.isInvited = false
        await user.save()

        userProject.invitationToken = undefined
        userProject.inviationTokenExpiresAt = undefined
        await userProject.save()

        // Accepting the invitation hands out an access token, so it is an access like
        // any other login.
        await recordLogin(user)

        return {
            user: user.toFrontendObject(),
            ...user.generateAuthToken()
        }
    }

    async resendInvitation(projectId: string | Schema.Types.ObjectId, userId: string | Schema.Types.ObjectId): Promise<IUserProject> {
        const project = await Project.findById(projectId)
        if (!project) {
            throw new ProjectNotFoundError(projectId.toString())
        }
        const userProject = await UserProject.findOne({ userId: toObjectId(userId), projectId: toObjectId(projectId) })
        if (!userProject) {
            throw new EntityNotFoundError("User is not a member of this project")
        }
        if (!userProject.invitationToken) {
            throw createBusinessException({
                code: "INVITATION_ALREADY_ACCEPTED",
                message: "This user has already accepted the invitation"
            })
        }
        const user = await User.findById(userProject.userId)
        if (!user) {
            throw new EntityNotFoundError(userProject.userId.toString())
        }
        if (!this.emailSenderService.canSendEmails()) {
            throw createBusinessException({
                code: "EMAIL_NOT_CONFIGURED",
                message: "Email delivery is not configured, invitations cannot be sent"
            })
        }
        return this.regenerateInvitation(userProject, user, project, userProject.role, true)
    }

    /**
     * Invitations addressed to the signed-in user that are still waiting for an answer.
     * Only reachable once the user can sign in, so it covers the "already registered user
     * invited to another project" case that the emailed link alone does not serve.
     */
    async getMyPendingInvitations(): Promise<IPendingInvitation[]> {
        const user = this.getUser()
        if (!user) {
            return []
        }

        const userProjects = await UserProject.find({
            userId: toObjectId(user._id),
            invitationToken: { $ne: null },
            // Expired invitations can no longer be accepted, so they are not offered at all
            $or: [{ inviationTokenExpiresAt: null }, { inviationTokenExpiresAt: { $gt: new Date() } }]
        }).populate<{ projectId: IProject | null }>("projectId", "name description")

        return userProjects
            .filter(up => Boolean(up.projectId))
            .map<IPendingInvitation>(up => {
                const project = up.projectId as unknown as IProject
                return {
                    projectId: project._id.toString(),
                    projectName: project.name,
                    projectDescription: project.description,
                    role: up.role,
                    invitedAt: up.createdAt,
                    expiresAt: up.inviationTokenExpiresAt
                }
            })
    }

    /** Accepts an invitation from inside the app: being signed in already proves the identity, so no token is needed. */
    async acceptMyInvitation(projectId: string | Schema.Types.ObjectId): Promise<IUserProject> {
        const user = this.getUser()
        if (!user) {
            throw createBusinessException({ code: "INVITATION_NOT_FOUND", message: "No pending invitation for this project", statusCode: 404 })
        }

        const userProject = await UserProject.findOne({
            userId: toObjectId(user._id),
            projectId: toObjectId(projectId),
            invitationToken: { $ne: null }
        })

        if (!userProject) {
            throw createBusinessException({ code: "INVITATION_NOT_FOUND", message: "No pending invitation for this project", statusCode: 404 })
        }
        if (userProject.inviationTokenExpiresAt && userProject.inviationTokenExpiresAt < new Date()) {
            throw createBusinessException({ code: "INVITATION_EXPIRED", message: "This invitation has expired", statusCode: 410 })
        }

        userProject.invitationToken = undefined
        userProject.inviationTokenExpiresAt = undefined
        return userProject.save()
    }

    /**
     * Declines an invitation by dropping the relationship altogether: the inviter sees the pending
     * invite disappear and can send a new one. Expired invitations can be declined too, to dismiss them.
     */
    async declineMyInvitation(projectId: string | Schema.Types.ObjectId): Promise<void> {
        const user = this.getUser()
        const result = user
            ? await UserProject.deleteOne({
                  userId: toObjectId(user._id),
                  projectId: toObjectId(projectId),
                  invitationToken: { $ne: null }
              })
            : undefined

        if (!result?.deletedCount) {
            throw createBusinessException({ code: "INVITATION_NOT_FOUND", message: "No pending invitation for this project", statusCode: 404 })
        }
    }

    private async findValidInvitation(token: string): Promise<IUserProject> {
        if (!token) {
            throw createBusinessException({ code: "INVALID_INVITATION", message: "Invalid invitation token", statusCode: 404 })
        }
        const userProject = await UserProject.findOne({ invitationToken: token })
        if (!userProject) {
            throw createBusinessException({ code: "INVALID_INVITATION", message: "Invalid invitation token", statusCode: 404 })
        }
        if (userProject.inviationTokenExpiresAt && userProject.inviationTokenExpiresAt < new Date()) {
            throw createBusinessException({ code: "INVITATION_EXPIRED", message: "This invitation has expired", statusCode: 410 })
        }
        return userProject
    }

    async addUserToProject(userId: string | ObjectId, projectId: string | ObjectId, role: RoleInProject, session?: ClientSession) {
        // Convert string IDs to ObjectId if needed
        const userIdObj = toObjectId(userId)
        const projectIdObj = toObjectId(projectId)

        // Verify project exists
        const project = await Project.findById(projectIdObj, {}, { session })
        if (!project) {
            throw new ProjectNotFoundError(projectIdObj.toString())
        }

        // Verify user exists
        const user = await User.findById(userIdObj, {}, { session })
        if (!user) {
            throw new EntityNotFoundError(`User with ID ${userIdObj} not found`)
        }

        // Check if user is already in the project
        const existingUserProject = await UserProject.findOne(
            {
                userId: userIdObj,
                projectId: projectIdObj
            },
            {},
            { session }
        )

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

    async getProjectUsers(projectId: string | Schema.Types.ObjectId): Promise<IUserInProject[] | undefined> {
        // Verify project exists
        const project = await Project.findById(projectId)
        if (!project) {
            throw new ProjectNotFoundError(projectId.toString())
        }

        type PopulatedUserProject = IUserProject & {
            user: IUser
        }

        const userProjects = await UserProject.find({ projectId: toObjectId(projectId) })
            .populate<{ user: IUser }>("userId", "email name surname status")
            .lean<PopulatedUserProject[]>()

        // Format the response. The raw invitation token is never exposed to clients.
        return userProjects.map<IUserInProject>(up => {
            const populatedUser = up.userId as unknown as IUser
            return {
                ...populatedUser,
                role: up.role,
                joinedAt: up.createdAt,
                invitationPending: Boolean(up.invitationToken),
                invitationExpiresAt: up.inviationTokenExpiresAt
            }
        })
    }
}

export default UserProjectService
