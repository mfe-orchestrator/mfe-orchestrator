import { randomBytes } from "crypto"
import { ClientSession, ObjectId, Schema } from "mongoose"
import { fastify } from ".."
import { createBusinessException } from "../errors/BusinessException"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import { OrganizationNotFoundError } from "../errors/OrganizationNotFoundError"
import Organization, { IOrganization } from "../models/OrganizationModel"
import Project from "../models/ProjectModel"
import User, { IUser, IUserDocument, UserStatus } from "../models/UserModel"
import UserOrganization, { IUserOrganization, RoleInOrganization } from "../models/UserOrganizationModel"
import UserProject from "../models/UserProjectModel"
import UserService, { recordLogin } from "../service/UserService"
import { toObjectId } from "../utils/mongooseUtils"
import BaseAuthorizedService from "./BaseAuthorizedService"
import EmailSenderService from "./EmailSenderService"

const INVITATION_TTL_DAYS = 5
const INVITATION_TTL_MS = INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000

/** A member of an organization, as the members page lists them. */
export interface IUserInOrganization extends Partial<IUser> {
    joinedAt: Date
    role: RoleInOrganization
    invitationPending: boolean
    invitationExpiresAt?: Date
    /** How many projects of this organization the user is a member of, so an admin sees who has nothing yet. */
    projectCount: number
}

interface IOrganizationInvitationInfo {
    organizationName: string
    role: RoleInOrganization
    email: string
    needsPassword: boolean
}

interface IAcceptInvitationData {
    password?: string
    name?: string
    surname?: string
}

/** An organization invitation waiting for an answer from the signed-in user. */
export interface IPendingOrganizationInvitation {
    organizationId: string
    organizationName: string
    organizationDescription?: string
    role: RoleInOrganization
    invitedAt: Date
    expiresAt?: Date
}

export class UserOrganizationService extends BaseAuthorizedService {
    emailSenderService = new EmailSenderService()
    userService = new UserService()

    /**
     * Makes sure the user belongs to the organization, without touching a membership that already exists.
     *
     * This is the path a project invitation goes through: inviting somebody to a project implies
     * inviting them to the organization that owns it, and the row is created already accepted because
     * belonging to an organization as a MEMBER grants nothing on its own — only the projects the user
     * was invited to are reachable. Whoever already holds a role keeps it: a project invitation must
     * never quietly demote an admin to member.
     */
    async ensureMembership(
        userId: string | ObjectId | Schema.Types.ObjectId,
        organizationId: string | ObjectId | Schema.Types.ObjectId,
        role: RoleInOrganization = RoleInOrganization.MEMBER,
        session?: ClientSession
    ): Promise<IUserOrganization> {
        const userIdObj = toObjectId(userId)
        const organizationIdObj = toObjectId(organizationId)

        const existing = await UserOrganization.findOne({ userId: userIdObj, organizationId: organizationIdObj }, {}, { session })
        if (existing) {
            return existing
        }

        return new UserOrganization({
            userId: userIdObj,
            organizationId: organizationIdObj,
            role
        }).save({ session })
    }

    /** Adds a user who already exists to an organization, used when no invitation email is involved. */
    async addUserToOrganization(
        userId: string | ObjectId,
        organizationId: string | ObjectId,
        role: RoleInOrganization,
        session?: ClientSession
    ): Promise<{ alreadyExists: boolean; role: RoleInOrganization; userOrganization?: IUserOrganization }> {
        const userIdObj = toObjectId(userId)
        const organizationIdObj = toObjectId(organizationId)

        const organization = await Organization.findById(organizationIdObj, {}, { session })
        if (!organization) {
            throw new OrganizationNotFoundError(organizationIdObj.toString())
        }

        const user = await User.findById(userIdObj, {}, { session })
        if (!user) {
            throw new EntityNotFoundError(`User with ID ${userIdObj} not found`)
        }

        const existing = await UserOrganization.findOne({ userId: userIdObj, organizationId: organizationIdObj }, {}, { session })
        if (existing) {
            return { alreadyExists: true, role: existing.role }
        }

        const userOrganization = await new UserOrganization({
            userId: userIdObj,
            organizationId: organizationIdObj,
            role
        }).save({ session })

        return { alreadyExists: false, role, userOrganization }
    }

    /**
     * Invites somebody to the organization by email, creating the account when it does not exist yet.
     *
     * Mirrors the project invitation deliberately: same time to live, same behaviour when no email
     * channel is configured (the membership is created straight away, because a confirmation link
     * that cannot be delivered would leave the user stuck).
     */
    async addUserToOrganizationByEmail(organizationId: string | Schema.Types.ObjectId, email: string, role: RoleInOrganization): Promise<IUserOrganization | undefined> {
        const organizationIdObj = toObjectId(organizationId)
        await this.ensureOrganizationAdmin(organizationIdObj)

        const organization = await Organization.findById(organizationIdObj)
        if (!organization) {
            throw new OrganizationNotFoundError(organizationIdObj.toString())
        }

        const canSendEmail = this.emailSenderService.canSendEmails()

        let user = await User.findOne({ email })
        if (!user) {
            fastify.log.info(`Inviting new user ${email} to organization ${organizationIdObj.toString()}`)
            user = await this.userService.register(
                {
                    email,
                    status: canSendEmail ? UserStatus.INVITED : UserStatus.ACTIVE
                },
                false
            )
        }

        const existing = await UserOrganization.findOne({ userId: toObjectId(user._id), organizationId: organizationIdObj })
        if (existing) {
            if (!existing.invitationToken) {
                throw createBusinessException({
                    code: "USER_ALREADY_IN_ORGANIZATION",
                    message: "This user is already a member of the organization"
                })
            }
            return this.regenerateInvitation(existing, user, organization, role, canSendEmail)
        }

        if (!canSendEmail) {
            return new UserOrganization({ userId: user._id, organizationId: organizationIdObj, role }).save()
        }

        const userOrganization = new UserOrganization({
            userId: user._id,
            organizationId: organizationIdObj,
            role,
            invitationToken: randomBytes(32).toString("hex"),
            invitationTokenExpiresAt: new Date(Date.now() + INVITATION_TTL_MS)
        })

        const saved = await userOrganization.save()
        await this.emailSenderService.sendOrganizationInvitationEmail(user, organization, role, userOrganization.invitationToken as string)
        return saved
    }

    private async regenerateInvitation(userOrganization: IUserOrganization, user: IUser, organization: IOrganization, role: RoleInOrganization, canSendEmail: boolean): Promise<IUserOrganization> {
        userOrganization.role = role
        if (canSendEmail) {
            userOrganization.invitationToken = randomBytes(32).toString("hex")
            userOrganization.invitationTokenExpiresAt = new Date(Date.now() + INVITATION_TTL_MS)
        }
        const saved = await userOrganization.save()
        if (canSendEmail) {
            await this.emailSenderService.sendOrganizationInvitationEmail(user, organization, role, userOrganization.invitationToken as string)
        }
        return saved
    }

    async resendInvitation(organizationId: string | Schema.Types.ObjectId, userId: string | Schema.Types.ObjectId): Promise<IUserOrganization> {
        const organizationIdObj = toObjectId(organizationId)
        await this.ensureOrganizationAdmin(organizationIdObj)

        const organization = await Organization.findById(organizationIdObj)
        if (!organization) {
            throw new OrganizationNotFoundError(organizationIdObj.toString())
        }
        const userOrganization = await UserOrganization.findOne({ userId: toObjectId(userId), organizationId: organizationIdObj })
        if (!userOrganization) {
            throw new EntityNotFoundError("User is not a member of this organization")
        }
        if (!userOrganization.invitationToken) {
            throw createBusinessException({
                code: "INVITATION_ALREADY_ACCEPTED",
                message: "This user has already accepted the invitation"
            })
        }
        const user = await User.findById(userOrganization.userId)
        if (!user) {
            throw new EntityNotFoundError(userOrganization.userId.toString())
        }
        if (!this.emailSenderService.canSendEmails()) {
            throw createBusinessException({
                code: "EMAIL_NOT_CONFIGURED",
                message: "Email delivery is not configured, invitations cannot be sent"
            })
        }
        return this.regenerateInvitation(userOrganization, user, organization, userOrganization.role, true)
    }

    async getOrganizationUsers(organizationId: string | Schema.Types.ObjectId): Promise<IUserInOrganization[]> {
        const organizationIdObj = toObjectId(organizationId)
        await this.ensureAccessToOrganization(organizationIdObj)

        const organization = await Organization.findById(organizationIdObj)
        if (!organization) {
            throw new OrganizationNotFoundError(organizationIdObj.toString())
        }

        type PopulatedUserOrganization = IUserOrganization & { user: IUser }

        const userOrganizations = await UserOrganization.find({ organizationId: organizationIdObj })
            .populate<{ user: IUser }>("userId", "email name surname status")
            .lean<PopulatedUserOrganization[]>()

        // One query for the whole page instead of one per member: how many projects of this
        // organization each of them actually reached.
        const projectIds = (await Project.find({ organizationId: organizationIdObj }, { _id: 1 }).lean()).map(project => project._id)
        const memberships = await UserProject.find({ projectId: { $in: projectIds }, invitationToken: null }, { userId: 1 }).lean()
        const projectCountByUser = memberships.reduce<Record<string, number>>((counts, membership) => {
            const key = membership.userId.toString()
            counts[key] = (counts[key] ?? 0) + 1
            return counts
        }, {})

        // The raw invitation token is never exposed to clients.
        return userOrganizations.map<IUserInOrganization>(userOrganization => {
            const populatedUser = userOrganization.userId as unknown as IUser
            return {
                ...populatedUser,
                role: userOrganization.role,
                joinedAt: userOrganization.createdAt,
                invitationPending: Boolean(userOrganization.invitationToken),
                invitationExpiresAt: userOrganization.invitationTokenExpiresAt,
                projectCount: projectCountByUser[populatedUser._id.toString()] ?? 0
            }
        })
    }

    /**
     * Changes the role of a member.
     *
     * The last owner cannot be demoted: an organization with no owner could no longer be
     * administered by anybody, and no other row grants that back.
     */
    async updateRole(organizationId: string | Schema.Types.ObjectId, userId: string | Schema.Types.ObjectId, role: RoleInOrganization): Promise<IUserOrganization> {
        const organizationIdObj = toObjectId(organizationId)
        const userIdObj = toObjectId(userId)
        await this.ensureOrganizationAdmin(organizationIdObj)

        const membership = await UserOrganization.findOne({ organizationId: organizationIdObj, userId: userIdObj })
        if (!membership) {
            throw new EntityNotFoundError("User is not a member of this organization")
        }

        // Ownership is handed out by owners only. An admin already administers everything else, but
        // letting them make themselves an owner would make the distinction meaningless — and take
        // from the owners the one thing that is theirs.
        const touchesOwnership = role === RoleInOrganization.OWNER || membership.role === RoleInOrganization.OWNER
        if (touchesOwnership && (await this.getRoleInOrganization(organizationIdObj)) !== RoleInOrganization.OWNER) {
            throw createBusinessException({
                code: "ORGANIZATION_OWNER_REQUIRED",
                message: "Only an owner can change who owns the organization",
                statusCode: 403
            })
        }

        if (membership.role === RoleInOrganization.OWNER && role !== RoleInOrganization.OWNER) {
            await this.ensureAnotherOwnerExists(organizationIdObj, userIdObj, "ORGANIZATION_LAST_OWNER", "Cannot demote the last owner of the organization. Please assign another owner first.")
        }

        membership.role = role
        return membership.save()
    }

    /**
     * Removes a member from the organization, and with them from every project of that organization:
     * leaving the project rows behind would keep granting access to data inside a tenant the user no
     * longer belongs to.
     */
    async removeUser(organizationId: string | Schema.Types.ObjectId, userId: string | Schema.Types.ObjectId): Promise<void> {
        const organizationIdObj = toObjectId(organizationId)
        const userIdObj = toObjectId(userId)
        await this.ensureOrganizationAdmin(organizationIdObj)

        const membership = await UserOrganization.findOne({ organizationId: organizationIdObj, userId: userIdObj })
        if (!membership) {
            throw new EntityNotFoundError("User is not a member of this organization")
        }

        if (membership.role === RoleInOrganization.OWNER) {
            await this.ensureAnotherOwnerExists(organizationIdObj, userIdObj, "ORGANIZATION_LAST_OWNER", "Cannot remove the last owner of the organization. Please assign another owner first.")
        }

        const projectIds = (await Project.find({ organizationId: organizationIdObj }, { _id: 1 }).lean()).map(project => project._id)
        await UserProject.deleteMany({ userId: userIdObj, projectId: { $in: projectIds } })
        await UserOrganization.deleteOne({ _id: membership._id })

        await this.deleteUserIfOnlyEverInvited(userIdObj)
    }

    /**
     * Drops the plain membership a project invitation created, once the user has no project left in
     * that organization.
     *
     * Only ever touches a MEMBER row that is not pending — the shape `ensureMembership` writes.
     * An owner, an admin, or somebody holding an invitation of their own was not put there by a
     * project invitation, so removing them is not this method's call to make.
     */
    async pruneImplicitMembership(userId: string | Schema.Types.ObjectId, organizationId: string | Schema.Types.ObjectId): Promise<void> {
        const userIdObj = toObjectId(userId)
        const organizationIdObj = toObjectId(organizationId)

        const projectIds = (await Project.find({ organizationId: organizationIdObj }, { _id: 1 }).lean()).map(project => project._id)
        const remaining = await UserProject.countDocuments({ userId: userIdObj, projectId: { $in: projectIds } })
        if (remaining > 0) {
            return
        }

        await UserOrganization.deleteOne({
            userId: userIdObj,
            organizationId: organizationIdObj,
            role: RoleInOrganization.MEMBER,
            invitationToken: null
        })
    }

    /**
     * Drops an account that only ever existed to be invited and is now attached to nothing.
     *
     * Without this, revoking an invitation would leave behind a user nobody can sign in as, showing
     * up in every future invitation as "already registered".
     */
    async deleteUserIfOnlyEverInvited(userId: Schema.Types.ObjectId): Promise<void> {
        const user = await User.findById(userId)
        if (!user || user.status !== UserStatus.INVITED) {
            return
        }

        const organizations = await UserOrganization.countDocuments({ userId })
        const projects = await UserProject.countDocuments({ userId })
        if (organizations === 0 && projects === 0) {
            await User.findByIdAndDelete(userId)
        }
    }

    private async ensureAnotherOwnerExists(organizationId: Schema.Types.ObjectId, userId: Schema.Types.ObjectId, code: string, message: string): Promise<void> {
        const otherOwners = await UserOrganization.countDocuments({
            organizationId,
            role: RoleInOrganization.OWNER,
            userId: { $ne: userId },
            invitationToken: null
        })

        if (otherOwners === 0) {
            throw createBusinessException({ code, message, statusCode: 400 })
        }
    }

    async getInvitationByToken(token: string): Promise<IOrganizationInvitationInfo> {
        const userOrganization = await this.findValidInvitation(token)
        const organization = await Organization.findById(userOrganization.organizationId)
        if (!organization) {
            throw new OrganizationNotFoundError(userOrganization.organizationId.toString())
        }
        const user = await User.findById(userOrganization.userId)
        if (!user) {
            throw new EntityNotFoundError(userOrganization.userId.toString())
        }
        return {
            organizationName: organization.name,
            role: userOrganization.role,
            email: user.email,
            needsPassword: !user.password
        }
    }

    async acceptInvitation(token: string, data: IAcceptInvitationData) {
        const userOrganization = await this.findValidInvitation(token)
        const user = (await User.findById(userOrganization.userId)) as IUserDocument | null
        if (!user) {
            throw new EntityNotFoundError(userOrganization.userId.toString())
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

        userOrganization.invitationToken = undefined
        userOrganization.invitationTokenExpiresAt = undefined
        await userOrganization.save()

        // Accepting the invitation hands out an access token, so it is an access like any other login.
        await recordLogin(user)

        return {
            user: user.toFrontendObject(),
            ...user.generateAuthToken()
        }
    }

    /** Organization invitations addressed to the signed-in user that are still waiting for an answer. */
    async getMyPendingInvitations(): Promise<IPendingOrganizationInvitation[]> {
        const user = this.getUser()
        if (!user) {
            return []
        }

        const userOrganizations = await UserOrganization.find({
            userId: toObjectId(user._id),
            invitationToken: { $ne: null },
            // Expired invitations can no longer be accepted, so they are not offered at all
            $or: [{ invitationTokenExpiresAt: null }, { invitationTokenExpiresAt: { $gt: new Date() } }]
        }).populate<{ organizationId: IOrganization | null }>("organizationId", "name description")

        return userOrganizations
            .filter(userOrganization => Boolean(userOrganization.organizationId))
            .map<IPendingOrganizationInvitation>(userOrganization => {
                const organization = userOrganization.organizationId as unknown as IOrganization
                return {
                    organizationId: organization._id.toString(),
                    organizationName: organization.name,
                    organizationDescription: organization.description,
                    role: userOrganization.role,
                    invitedAt: userOrganization.createdAt,
                    expiresAt: userOrganization.invitationTokenExpiresAt
                }
            })
    }

    /** Accepts an invitation from inside the app: being signed in already proves the identity, so no token is needed. */
    async acceptMyInvitation(organizationId: string | Schema.Types.ObjectId): Promise<IUserOrganization> {
        const user = this.getUser()
        const userOrganization = user
            ? await UserOrganization.findOne({
                  userId: toObjectId(user._id),
                  organizationId: toObjectId(organizationId),
                  invitationToken: { $ne: null }
              })
            : null

        if (!userOrganization) {
            throw createBusinessException({ code: "INVITATION_NOT_FOUND", message: "No pending invitation for this organization", statusCode: 404 })
        }
        if (userOrganization.invitationTokenExpiresAt && userOrganization.invitationTokenExpiresAt < new Date()) {
            throw createBusinessException({ code: "INVITATION_EXPIRED", message: "This invitation has expired", statusCode: 410 })
        }

        userOrganization.invitationToken = undefined
        userOrganization.invitationTokenExpiresAt = undefined
        return userOrganization.save()
    }

    /** Declines an invitation by dropping the row, so the inviter can send a new one. */
    async declineMyInvitation(organizationId: string | Schema.Types.ObjectId): Promise<void> {
        const user = this.getUser()
        const result = user
            ? await UserOrganization.deleteOne({
                  userId: toObjectId(user._id),
                  organizationId: toObjectId(organizationId),
                  invitationToken: { $ne: null }
              })
            : undefined

        if (!result?.deletedCount) {
            throw createBusinessException({ code: "INVITATION_NOT_FOUND", message: "No pending invitation for this organization", statusCode: 404 })
        }
    }

    private async findValidInvitation(token: string): Promise<IUserOrganization> {
        if (!token) {
            throw createBusinessException({ code: "INVALID_INVITATION", message: "Invalid invitation token", statusCode: 404 })
        }
        const userOrganization = await UserOrganization.findOne({ invitationToken: token })
        if (!userOrganization) {
            throw createBusinessException({ code: "INVALID_INVITATION", message: "Invalid invitation token", statusCode: 404 })
        }
        if (userOrganization.invitationTokenExpiresAt && userOrganization.invitationTokenExpiresAt < new Date()) {
            throw createBusinessException({ code: "INVITATION_EXPIRED", message: "This invitation has expired", statusCode: 410 })
        }
        return userOrganization
    }
}

export default UserOrganizationService
