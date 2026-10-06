import { Schema } from "mongoose"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import OAuthClient, { OAuthClientRegistrationType } from "../models/OAuthClientModel"
import OAuthGrant, { IOAuthGrant, OAuthGrantRevocationReason } from "../models/OAuthGrantModel"
import Project from "../models/ProjectModel"
import User from "../models/UserModel"
import UserOrganization, { ORGANIZATION_ADMIN_ROLES } from "../models/UserOrganizationModel"
import UserProject, { RoleInProject } from "../models/UserProjectModel"
import { toObjectId } from "../utils/mongooseUtils"
import { getOAuthConfig, MCP_SCOPE_WRITE, OAuthConfig } from "../utils/oauthConfig"
import BaseAuthorizedService from "./BaseAuthorizedService"
import { deleteRefreshTokensOfGrant } from "./OAuthTokenService"

/** How long a revoked or expired grant is kept before the TTL index drops it. */
const GRANT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

type Id = string | Schema.Types.ObjectId

/**
 * The role that decides what a user may let a MCP client do on a project.
 *
 * An explicit membership answers with its role. Administering the organization that owns the
 * project counts as OWNER: an organization admin reaches every project of it with full powers,
 * as BaseAuthorizedService already grants. A pending invitation is no membership at all.
 */
export const resolveProjectRole = async (userId: Id, projectId: Id): Promise<RoleInProject | undefined> => {
    const project = await Project.findOne({ _id: toObjectId(projectId) }, { organizationId: 1 })
    if (!project) {
        return undefined
    }

    const organizationMembership = await UserOrganization.findOne({ userId: toObjectId(userId), organizationId: project.organizationId, invitationToken: null })
    if (organizationMembership && ORGANIZATION_ADMIN_ROLES.includes(organizationMembership.role)) {
        return RoleInProject.OWNER
    }

    const membership = await UserProject.findOne({ userId: toObjectId(userId), projectId: toObjectId(projectId), invitationToken: null })
    return membership?.role
}

/**
 * A VIEWER can only ever hand out read access, whatever the client asked for and whatever the
 * grant once said: the cap is applied both at consent and on every request, so demoting a member
 * to VIEWER takes write access away from their MCP clients on the next call.
 */
export const capScopesToRole = (scopes: string[], role: RoleInProject): string[] => (role === RoleInProject.VIEWER ? scopes.filter(scope => scope !== MCP_SCOPE_WRITE) : [...scopes])

export const createGrant = async (grant: { userId: Id; projectId: Id; clientId: string; scopes: string[] }, config: OAuthConfig = getOAuthConfig()): Promise<IOAuthGrant> => {
    const expiresAt = new Date(Date.now() + config.grantMaxTtlMs)
    const created = await OAuthGrant.create({
        userId: toObjectId(grant.userId),
        projectId: toObjectId(grant.projectId),
        clientId: grant.clientId,
        scopes: grant.scopes,
        expiresAt,
        purgeAt: new Date(expiresAt.getTime() + GRANT_RETENTION_MS)
    })
    // A client someone actually authorized is no longer a candidate for the unused-client cleanup
    await OAuthClient.updateOne({ clientId: grant.clientId }, { $unset: { unusedExpiresAt: 1 } })
    return created
}

/** Revokes a grant and everything that proves it. Revoking twice keeps the first reason. */
export const revokeGrant = async (grantId: Id, reason: OAuthGrantRevocationReason): Promise<void> => {
    const now = new Date()
    await OAuthGrant.updateOne({ _id: toObjectId(grantId), revokedAt: null }, { revokedAt: now, revokedReason: reason, purgeAt: new Date(now.getTime() + GRANT_RETENTION_MS) })
    await deleteRefreshTokensOfGrant(grantId.toString())
}

const isActive = (grant: IOAuthGrant, now = new Date()) => !grant.revokedAt && grant.expiresAt > now

/** Writing `lastUsedAt` on every MCP call would be one database write per tool call for nothing. */
const LAST_USED_RESOLUTION_MS = 60 * 1000

export interface AuthenticatedGrant {
    grant: IOAuthGrant
    role: RoleInProject
    /** The scopes usable right now: the granted ones, capped by the role the user holds today. */
    scopes: string[]
}

/**
 * The grant behind a token, if it can still be used.
 *
 * Checked on every MCP request and every refresh, which is what makes revocation immediate: the
 * grant must be live, must match what the token claims, and its user must still reach the
 * project. A user who lost the project loses the grant for good, not just this request.
 */
export const authenticateGrant = async (expected: { grantId: string; userId: string; projectId: string; clientId: string }): Promise<AuthenticatedGrant | undefined> => {
    const grant = await OAuthGrant.findById(toObjectId(expected.grantId))
    if (!grant || !isActive(grant)) {
        return undefined
    }
    if (grant.userId.toString() !== expected.userId || grant.projectId.toString() !== expected.projectId || grant.clientId !== expected.clientId) {
        return undefined
    }

    const role = await resolveProjectRole(grant.userId, grant.projectId)
    if (!role) {
        await revokeGrant(grant._id.toString(), OAuthGrantRevocationReason.MEMBERSHIP_LOST)
        return undefined
    }

    const now = new Date()
    if (!grant.lastUsedAt || now.getTime() - grant.lastUsedAt.getTime() > LAST_USED_RESOLUTION_MS) {
        await OAuthGrant.updateOne({ _id: grant._id }, { lastUsedAt: now })
    }

    return { grant, role, scopes: capScopesToRole(grant.scopes, role) }
}

export interface McpClientGrantDTO {
    id: string
    clientName: string
    clientId: string
    registrationType: OAuthClientRegistrationType
    userEmail: string
    scopes: string[]
    createdAt: Date
    lastUsedAt?: Date
}

/** The console side of the grants: who connected which MCP client to a project, and revocation. */
export class OAuthGrantService extends BaseAuthorizedService {
    /**
     * The live grants of a project. A project OWNER (or an organization admin) sees everyone's,
     * any other member only their own: knowing which tools a colleague connected is not theirs.
     */
    async listForProject(projectId: string): Promise<McpClientGrantDTO[]> {
        await this.ensureAccessToProject(projectId)
        const userId = this.getUser()!._id
        const role = await resolveProjectRole(userId, projectId)

        const filter: Record<string, unknown> = { projectId: toObjectId(projectId), revokedAt: null, expiresAt: { $gt: new Date() } }
        if (role !== RoleInProject.OWNER) {
            filter.userId = toObjectId(userId)
        }
        const grants = await OAuthGrant.find(filter).sort({ createdAt: -1 })

        const clients = await OAuthClient.find({ clientId: { $in: [...new Set(grants.map(grant => grant.clientId))] } })
        const clientById = new Map(clients.map(client => [client.clientId, client]))
        const users = await User.find({ _id: { $in: [...new Set(grants.map(grant => grant.userId.toString()))].map(id => toObjectId(id)) } }, { email: 1 })
        const emailById = new Map(users.map(user => [user._id.toString(), user.email]))

        return grants.map(grant => {
            const client = clientById.get(grant.clientId)
            return {
                id: grant._id.toString(),
                // A DCR client nobody used is purged after a day, but its grants outlive it: the
                // client id is then the only name left to show
                clientName: client?.clientName ?? grant.clientId,
                clientId: grant.clientId,
                registrationType: client?.registrationType ?? (grant.clientId.startsWith("https://") ? OAuthClientRegistrationType.CIMD : OAuthClientRegistrationType.DCR),
                userEmail: emailById.get(grant.userId.toString()) ?? "",
                scopes: grant.scopes,
                createdAt: grant.createdAt,
                lastUsedAt: grant.lastUsedAt
            }
        })
    }

    /**
     * Revokes a grant from the console. Allowed to whoever owns it and to the project OWNERs; to
     * anyone else the grant does not exist, so its id reveals nothing.
     */
    async revoke(grantId: string): Promise<void> {
        const grant = await OAuthGrant.findById(toObjectId(grantId))
        if (!grant || grant.revokedAt) {
            throw new EntityNotFoundError(grantId)
        }

        const userId = this.getUser()!._id.toString()
        const isOwnGrant = grant.userId.toString() === userId
        if (!isOwnGrant) {
            const canReachProject = await this.hasAccessToProject(grant.projectId)
            const role = canReachProject ? await resolveProjectRole(userId, grant.projectId) : undefined
            if (role !== RoleInProject.OWNER) {
                throw new EntityNotFoundError(grantId)
            }
        }

        await revokeGrant(grant._id.toString(), OAuthGrantRevocationReason.CONSOLE)
    }
}

export default OAuthGrantService
