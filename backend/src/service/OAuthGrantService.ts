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

/** The projects of a grant, whichever shape it was stored in. */
export const projectIdsOfGrant = (grant: Pick<IOAuthGrant, "projectIds" | "projectId">): string[] => {
    if (grant.projectIds && grant.projectIds.length > 0) {
        return grant.projectIds.map(String)
    }
    return grant.projectId ? [String(grant.projectId)] : []
}

/** Mongo filter matching the grants that include a project, in either stored shape. */
const includesProject = (projectId: Id) => ({ $or: [{ projectIds: toObjectId(projectId) }, { projectId: toObjectId(projectId) }] })

export const createGrant = async (grant: { userId: Id; projectIds: Id[]; clientId: string; scopes: string[] }, config: OAuthConfig = getOAuthConfig()): Promise<IOAuthGrant> => {
    const expiresAt = new Date(Date.now() + config.grantMaxTtlMs)
    const created = await OAuthGrant.create({
        userId: toObjectId(grant.userId),
        projectIds: grant.projectIds.map(projectId => toObjectId(projectId)),
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

/** A project a grant shares, with the role the user holds on it today. */
export interface SharedProject {
    projectId: string
    role: RoleInProject
}

export interface AuthenticatedGrant {
    grant: IOAuthGrant
    /** The grant's projects the user still reaches, with today's role on each. */
    projects: SharedProject[]
    /**
     * The scopes usable right now. `mfe:write` survives only if at least one project still lets
     * the user write; the per-project VIEWER cap is applied again when a tool picks its project.
     */
    scopes: string[]
}

/**
 * The grant behind a token, if it can still be used.
 *
 * Checked on every MCP request and every refresh, which is what makes revocation immediate: the
 * grant must be live, must match what the token claims, and its user must still reach its
 * projects. A project the user lost is left out of this request; when none is left the grant is
 * revoked for good. A grant written before grants could span several projects is rewritten to the
 * new shape here, the first time it is used.
 */
export const authenticateGrant = async (expected: { grantId: string; userId: string; clientId: string; projectIds?: string[] }): Promise<AuthenticatedGrant | undefined> => {
    const grant = await OAuthGrant.findById(toObjectId(expected.grantId))
    if (!grant || !isActive(grant)) {
        return undefined
    }
    const grantProjectIds = projectIdsOfGrant(grant)
    if (grant.userId.toString() !== expected.userId || grant.clientId !== expected.clientId) {
        return undefined
    }
    // A token can only name projects of its grant
    if (expected.projectIds && expected.projectIds.some(projectId => !grantProjectIds.includes(projectId))) {
        return undefined
    }

    if (!grant.projectIds || grant.projectIds.length === 0) {
        await OAuthGrant.updateOne({ _id: grant._id }, { projectIds: grantProjectIds.map(projectId => toObjectId(projectId)), $unset: { projectId: 1 } })
    }

    const requested = expected.projectIds ?? grantProjectIds
    const projects: SharedProject[] = []
    for (const projectId of requested) {
        const role = await resolveProjectRole(grant.userId, projectId)
        if (role) {
            projects.push({ projectId, role })
        }
    }
    if (projects.length === 0) {
        await revokeGrant(grant._id.toString(), OAuthGrantRevocationReason.MEMBERSHIP_LOST)
        return undefined
    }

    const now = new Date()
    if (!grant.lastUsedAt || now.getTime() - grant.lastUsedAt.getTime() > LAST_USED_RESOLUTION_MS) {
        await OAuthGrant.updateOne({ _id: grant._id }, { lastUsedAt: now })
    }

    const canWriteSomewhere = projects.some(project => project.role !== RoleInProject.VIEWER)
    return { grant, projects, scopes: canWriteSomewhere ? [...grant.scopes] : capScopesToRole(grant.scopes, RoleInProject.VIEWER) }
}

export interface McpClientGrantDTO {
    id: string
    clientName: string
    clientId: string
    registrationType: OAuthClientRegistrationType
    userEmail: string
    scopes: string[]
    /** The grant's projects the person looking can reach themselves: never a name they could not see. */
    projects: { id: string; name: string }[]
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

        const filter: Record<string, unknown> = { ...includesProject(projectId), revokedAt: null, expiresAt: { $gt: new Date() } }
        if (role !== RoleInProject.OWNER) {
            filter.userId = toObjectId(userId)
        }
        const grants = await OAuthGrant.find(filter).sort({ createdAt: -1 })

        const clients = await OAuthClient.find({ clientId: { $in: [...new Set(grants.map(grant => grant.clientId))] } })
        const clientById = new Map(clients.map(client => [client.clientId, client]))
        const users = await User.find({ _id: { $in: [...new Set(grants.map(grant => grant.userId.toString()))].map(id => toObjectId(id)) } }, { email: 1 })
        const emailById = new Map(users.map(user => [user._id.toString(), user.email]))

        const allProjectIds = [...new Set(grants.flatMap(grant => projectIdsOfGrant(grant)))]
        const reachable: string[] = []
        for (const candidate of allProjectIds) {
            if (await resolveProjectRole(userId, candidate)) reachable.push(candidate)
        }
        const projectDocuments = await Project.find({ _id: { $in: reachable.map(id => toObjectId(id)) } }, { name: 1 })
        const projectNameById = new Map(projectDocuments.map(project => [project._id.toString(), project.name]))

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
                projects: projectIdsOfGrant(grant)
                    .filter(id => projectNameById.has(id))
                    .map(id => ({ id, name: projectNameById.get(id) as string })),
                createdAt: grant.createdAt,
                lastUsedAt: grant.lastUsedAt
            }
        })
    }

    /**
     * Revokes a grant from the console. Allowed to whoever owns it and to the OWNERs (organization
     * admins included) of any project it shares; to anyone else the grant does not exist, so its id
     * reveals nothing.
     */
    async revoke(grantId: string): Promise<void> {
        const grant = await OAuthGrant.findById(toObjectId(grantId))
        if (!grant || grant.revokedAt) {
            throw new EntityNotFoundError(grantId)
        }

        const userId = this.getUser()!._id.toString()
        const isOwnGrant = grant.userId.toString() === userId
        if (!isOwnGrant) {
            let ownsOne = false
            for (const projectId of projectIdsOfGrant(grant)) {
                if ((await this.hasAccessToProject(projectId)) && (await resolveProjectRole(userId, projectId)) === RoleInProject.OWNER) {
                    ownsOne = true
                    break
                }
            }
            if (!ownsOne) {
                throw new EntityNotFoundError(grantId)
            }
        }

        await revokeGrant(grant._id.toString(), OAuthGrantRevocationReason.CONSOLE)
    }
}

export default OAuthGrantService
