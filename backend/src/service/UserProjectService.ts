import { randomBytes } from "crypto"
import { ClientSession, isValidObjectId, ObjectId, Schema } from "mongoose"
import { fastify } from ".."
import { createBusinessException } from "../errors/BusinessException"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import { ProjectNotFoundError } from "../errors/ProjectNotFoundError"
import Domain from "../models/DomainModel"
import Organization from "../models/OrganizationModel"
import Project, { IProject } from "../models/ProjectModel"
import User, { IUser, IUserDocument, UserStatus } from "../models/UserModel"
import UserOrganization, { ORGANIZATION_ADMIN_ROLES } from "../models/UserOrganizationModel"
import UserProject, { IUserProject, RoleInProject } from "../models/UserProjectModel"
import UserService, { recordLogin } from "../service/UserService"
import { toObjectId } from "../utils/mongooseUtils"
import BaseAuthorizedService from "./BaseAuthorizedService"
import EmailSenderService from "./EmailSenderService"
import UserOrganizationService from "./UserOrganizationService"

/** Code of the refusal to remove or demote the last owner of a project. */
export const PROJECT_LAST_OWNER = "PROJECT_LAST_OWNER"
/** Code of the refusal of a membership scoped to a domain that is not one of the project. */
export const INVALID_DOMAIN = "INVALID_DOMAIN"
/** Code of the refusal of an owner confined to some domains: an owner manages the whole project. */
export const DOMAIN_SCOPE_NOT_FOR_OWNER = "DOMAIN_SCOPE_NOT_FOR_OWNER"

/** What a membership reaches: the whole project, or only the domains listed. */
interface DomainScope {
    domainScoped: boolean
    domainIds: Schema.Types.ObjectId[]
}

const WHOLE_PROJECT: DomainScope = { domainScoped: false, domainIds: [] }

/** The domain scope as the answers carry it: the ids, empty for a member of the whole project. */
const domainIdsOf = (membership: { domainScoped?: boolean; domainIds?: unknown[] }): string[] => (membership.domainScoped ? (membership.domainIds ?? []).map(String) : [])

const INVITATION_TTL_DAYS = 5
const INVITATION_TTL_MS = INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000

// Get all user-project relationships for this project
interface IUserInProject extends Partial<IUser> {
    joinedAt: Date
    role: RoleInProject
    /** The domains the member is confined to; empty when they reach the whole project. */
    domainIds: string[]
    /**
     * Whether the member is confined to domains at all. Only differs from a non-empty `domainIds` once
     * every domain of the scope was deleted: the member then reaches none, not the whole project.
     */
    domainScoped: boolean
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
    /**
     * The organization the project belongs to. Carried along because the app works inside one
     * organization at a time: accepting an invitation to a project of another one has to move the user
     * there, or they would accept it and then not find the project.
     */
    organizationId: string
    organizationName?: string
    role: RoleInProject
    invitedAt: Date
    expiresAt?: Date
}
class UserProjectService extends BaseAuthorizedService {
    emailSenderService = new EmailSenderService()
    userService = new UserService()
    userOrganizationService = new UserOrganizationService()

    /** Owners (and organization administrators) only: an invitation hands out access with a role. */
    async addUserToProjectByEmail(projectId: string | Schema.Types.ObjectId, email: string, role: RoleInProject, domainIds?: unknown): Promise<IUserProject | undefined> {
        const projectIdObj = toObjectId(projectId)
        const project = await this.ensureCanManageMembers(projectIdObj)
        // Before the user is looked up or created: a refused scope must leave nothing behind
        const scope = await this.resolveScope(projectIdObj, role, domainIds ?? [])

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

        // Being invited to a project means being let into the organization that owns it: without a
        // membership there the invitee would accept an invitation to a project sitting in a tenant
        // they do not belong to. The row is created as a plain member, which on its own grants
        // nothing — only the projects they are invited to are reachable.
        await this.userOrganizationService.ensureMembership(user._id, project.organizationId)

        // A user can only have one relationship per project
        const existing = await UserProject.findOne({ userId: toObjectId(user._id), projectId: projectIdObj })

        if (existing) {
            if (!existing.invitationToken) {
                throw createBusinessException({
                    code: "USER_ALREADY_IN_PROJECT",
                    message: "This user is already a member of the project"
                })
            }
            // Pending invite already exists: refresh it (acts as a re-invite), with the scope asked now
            return this.regenerateInvitation(existing, user, project, role, canSendEmail, scope)
        }

        // Without email delivery the invite cannot be confirmed, so join immediately
        if (!canSendEmail) {
            const userProject = new UserProject({ userId: user._id, projectId: projectIdObj, role, ...scope })
            return userProject.save()
        }

        const userProject = new UserProject({
            userId: user._id,
            projectId: projectIdObj,
            role,
            ...scope,
            invitationToken: randomBytes(32).toString("hex"),
            inviationTokenExpiresAt: new Date(Date.now() + INVITATION_TTL_MS)
        })

        const out = await userProject.save()
        await this.emailSenderService.sendUserInvitationEmail(user, project, role, userProject.invitationToken as string)
        return out
    }

    /** `scope` replaces the stored one when given; a resend of the same invitation leaves it out. */
    private async regenerateInvitation(userProject: IUserProject, user: IUser, project: IProject, role: RoleInProject, canSendEmail: boolean, scope?: DomainScope): Promise<IUserProject> {
        userProject.role = role
        if (scope) {
            userProject.domainScoped = scope.domainScoped
            userProject.domainIds = scope.domainIds
        }
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

    /** Owners (and organization administrators) only: a fresh invitation link grants access. */
    async resendInvitation(projectId: string | Schema.Types.ObjectId, userId: string | Schema.Types.ObjectId): Promise<IUserProject> {
        const project = await this.ensureCanManageMembers(toObjectId(projectId))
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
        }).populate<{ projectId: IProject | null }>("projectId", "name description organizationId")

        const pending = userProjects.filter(up => Boolean(up.projectId))

        // One query for all of them: the switcher needs the organization name beside the project name,
        // and a lookup per invitation would be a query per row of a list that is usually one row long.
        const organizationIds = pending.map(up => (up.projectId as unknown as IProject).organizationId)
        const organizations = await Organization.find({ _id: { $in: organizationIds } }, { name: 1 }).lean()
        const organizationNameById = new Map(organizations.map(organization => [organization._id.toString(), organization.name]))

        return pending.map<IPendingInvitation>(up => {
            const project = up.projectId as unknown as IProject
            const organizationId = project.organizationId?.toString()
            return {
                projectId: project._id.toString(),
                projectName: project.name,
                projectDescription: project.description,
                organizationId,
                organizationName: organizationNameById.get(organizationId),
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

        // The organization membership was a side effect of this invitation, so declining takes it back
        // as well — unless the user has other projects there, or a role of their own in it.
        const project = await Project.findById(toObjectId(projectId), { organizationId: 1 })
        if (project && user) {
            await this.userOrganizationService.pruneImplicitMembership(user._id, project.organizationId)
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

    /**
     * Changes the role of a member (or of a pending invitation), and their domain scope when `domainIds`
     * is given: a list replaces it, an empty one opens the whole project. Left out, the scope stays.
     *
     * The last owner cannot be demoted: a project with no owner could no longer have its members managed.
     */
    async updateUserRole(projectId: string | Schema.Types.ObjectId, userId: string | Schema.Types.ObjectId, role: RoleInProject, domainIds?: unknown): Promise<IUserProject> {
        const projectIdObj = toObjectId(projectId)
        const userIdObj = toObjectId(userId)
        await this.ensureCanManageMembers(projectIdObj)

        if (!(await User.findById(userIdObj))) {
            throw new EntityNotFoundError(`User with ID ${userId} not found`)
        }
        const membership = await UserProject.findOne({ userId: userIdObj, projectId: projectIdObj })
        if (!membership) {
            throw new EntityNotFoundError("User is not a member of this project")
        }

        // The stored scope counts as asked when none is given: promoting a domain member to owner without
        // opening the whole project to them is refused, not silently widened. Also when every domain of the
        // scope was deleted: only an explicit empty list widens it
        if (domainIds === undefined && membership.domainScoped && role === RoleInProject.OWNER) {
            throw createBusinessException({ code: DOMAIN_SCOPE_NOT_FOR_OWNER, message: "An owner manages the whole project: open it to the member to make them one", statusCode: 400 })
        }
        const scope = await this.resolveScope(projectIdObj, role, domainIds ?? domainIdsOf(membership))
        if (domainIds === undefined && membership.domainScoped && role !== RoleInProject.OWNER) {
            // Kept as it is, a scope left over nothing by deleted domains included
            scope.domainScoped = true
        }

        if (membership.role === RoleInProject.OWNER && role !== RoleInProject.OWNER && !membership.invitationToken) {
            await this.ensureAnotherOwnerExists(projectIdObj, userIdObj, "Cannot demote the last owner of the project. Please assign another owner first.")
        }

        membership.role = role
        membership.domainScoped = scope.domainScoped
        membership.domainIds = scope.domainIds
        return membership.save()
    }

    /**
     * Removes a member from the project, or revokes a pending invitation.
     *
     * A user created only to be invited, who never accepted, is cleaned up with the organization
     * membership the invitation gave them: nothing would point at the account any more.
     */
    async removeUserFromProject(projectId: string | Schema.Types.ObjectId, userId: string | Schema.Types.ObjectId): Promise<void> {
        const projectIdObj = toObjectId(projectId)
        const userIdObj = toObjectId(userId)
        const project = await this.ensureCanManageMembers(projectIdObj)

        const user = await User.findById(userIdObj)
        if (!user) {
            throw new EntityNotFoundError(`User with ID ${userId} not found`)
        }
        const membership = await UserProject.findOne({ userId: userIdObj, projectId: projectIdObj })
        if (!membership) {
            throw new EntityNotFoundError("User is not a member of this project")
        }

        if (membership.role === RoleInProject.OWNER && !membership.invitationToken) {
            await this.ensureAnotherOwnerExists(projectIdObj, userIdObj, "Cannot remove the last owner of the project. Please assign another owner first.")
        }

        await UserProject.deleteOne({ _id: membership._id })

        // The organization membership was created by this very invitation, so it goes first: the
        // account is dropped only once nothing at all points at it any more.
        if (user.status === UserStatus.INVITED) {
            await this.userOrganizationService.pruneImplicitMembership(userIdObj, project.organizationId)
            await this.userOrganizationService.deleteUserIfOnlyEverInvited(userIdObj)
        }
    }

    /**
     * Who is in the project, and with which role, is decided by its owners: a MEMBER or a VIEWER could
     * otherwise make themselves an OWNER or throw the owners out. Organization administrators reach
     * every project of their organization and act there as owners, as the assistant and the MCP
     * consent page treat them. An owner confined to some domains cannot exist (see resolveScope), but
     * the check does not rely on it: managing members is a decision over the whole project.
     */
    private async ensureCanManageMembers(projectId: Schema.Types.ObjectId): Promise<IProject> {
        await this.ensureAccessToProject(projectId)
        const project = await Project.findById(projectId)
        if (!project) {
            throw new ProjectNotFoundError(projectId.toString())
        }

        const user = this.getUser()
        const membership = user && (await UserProject.findOne({ userId: toObjectId(user._id), projectId, invitationToken: null }))
        if (membership?.role === RoleInProject.OWNER && !membership.domainScoped) {
            return project
        }
        const organizationRole = await this.findRoleInOrganization(project.organizationId)
        if (organizationRole && ORGANIZATION_ADMIN_ROLES.includes(organizationRole)) {
            return project
        }
        throw createBusinessException({
            code: "PROJECT_OWNER_REQUIRED",
            message: "Only an owner of the project can change its members",
            statusCode: 403
        })
    }

    /**
     * The domain scope a membership is given, checked: a list of ids of domains of the project, none of
     * them for an owner. An empty list is the whole project.
     */
    private async resolveScope(projectId: Schema.Types.ObjectId, role: RoleInProject, domainIds: unknown): Promise<DomainScope> {
        if (!Array.isArray(domainIds) || !domainIds.every(id => typeof id === "string" && isValidObjectId(id))) {
            throw createBusinessException({ code: INVALID_DOMAIN, message: "domainIds must be a list of domain identifiers", statusCode: 400 })
        }
        const unique = [...new Set(domainIds as string[])]
        if (unique.length === 0) {
            return { ...WHOLE_PROJECT }
        }
        if (role === RoleInProject.OWNER) {
            throw createBusinessException({ code: DOMAIN_SCOPE_NOT_FOR_OWNER, message: "An owner manages the whole project and cannot be confined to some domains", statusCode: 400 })
        }
        const found = await Domain.find({ _id: { $in: unique.map(id => toObjectId(id)) }, projectId }, { _id: 1 })
        const known = new Set(found.map(domain => String(domain._id)))
        const unknown = unique.find(id => !known.has(id))
        if (unknown) {
            throw createBusinessException({ code: INVALID_DOMAIN, message: `There is no domain ${unknown} in this project`, statusCode: 400 })
        }
        return { domainScoped: true, domainIds: unique.map(id => toObjectId(id)) }
    }

    /** Pending invitations do not count: until accepted, an invited owner owns nothing. */
    private async ensureAnotherOwnerExists(projectId: Schema.Types.ObjectId, userId: Schema.Types.ObjectId, message: string): Promise<void> {
        const otherOwners = await UserProject.countDocuments({
            projectId,
            role: RoleInProject.OWNER,
            userId: { $ne: userId },
            invitationToken: null
        })
        if (otherOwners === 0) {
            throw createBusinessException({ code: PROJECT_LAST_OWNER, message, statusCode: 400 })
        }
    }

    async getProjectUsers(projectId: string | Schema.Types.ObjectId): Promise<IUserInProject[] | undefined> {
        await this.ensureAccessToProject(projectId)
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

        // An owner of the project, or an administrator of the organization, reaches the whole project whatever
        // their membership says, as every check and the project list treat them
        const administrators = new Set(
            (await UserOrganization.find({ organizationId: project.organizationId, role: { $in: ORGANIZATION_ADMIN_ROLES }, invitationToken: null }, { userId: 1 }).lean()).map(membership =>
                String(membership.userId)
            )
        )

        // Format the response. The raw invitation token is never exposed to clients.
        return userProjects.map<IUserInProject>(up => {
            const populatedUser = up.userId as unknown as IUser
            const scope = up.role === RoleInProject.OWNER || administrators.has(String(populatedUser?._id)) ? WHOLE_PROJECT : up
            return {
                ...populatedUser,
                role: up.role,
                domainIds: domainIdsOf(scope),
                domainScoped: Boolean(scope.domainScoped),
                joinedAt: up.createdAt,
                invitationPending: Boolean(up.invitationToken),
                invitationExpiresAt: up.inviationTokenExpiresAt
            }
        })
    }
}

export default UserProjectService
