import { FastifyBaseLogger } from "fastify"
import { QueryFilter, Schema } from "mongoose"
import Organization from "../models/OrganizationModel"
import Project, { IProject } from "../models/ProjectModel"
import User, { IUser } from "../models/UserModel"
import UserOrganization, { RoleInOrganization } from "../models/UserOrganizationModel"
import UserProject, { RoleInProject } from "../models/UserProjectModel"
import { slugify } from "./slugUtils"

/** Projects written before organizations existed: the field is simply not there. */
const WITHOUT_ORGANIZATION = { $or: [{ organizationId: { $exists: false } }, { organizationId: null }] } as QueryFilter<IProject>

/** Where projects end up when not a single user is attached to them, so an operator can find them again. */
const FALLBACK_ORGANIZATION_NAME = "Default organization"

/** The organization role a project role converts into, for the members that come along with the project. */
const ORGANIZATION_ROLE_BY_PROJECT_ROLE: Record<RoleInProject, RoleInOrganization> = {
    // A second owner of the project administers the organization too, one step below its owner: the
    // organization has exactly one owner, and demoting the others to plain members would take away
    // the administration they already had.
    [RoleInProject.OWNER]: RoleInOrganization.ADMIN,
    [RoleInProject.MEMBER]: RoleInOrganization.MEMBER,
    [RoleInProject.VIEWER]: RoleInOrganization.MEMBER
}

/** What to call the organization of a user, from whatever the account actually carries. */
const organizationNameFor = (user: IUser): string => {
    const fullName = [user.name, user.surname].filter(Boolean).join(" ").trim()
    const base = fullName || user.email?.split("@")[0] || "My"
    return `${base} workspace`
}

/**
 * The organization a user owns, reused when there already is one.
 *
 * This is what makes the migration safe to interrupt: a re-run finds the organization the previous
 * pass created for that owner and keeps filling it, instead of opening a second one beside it.
 */
const findOrCreateOwnedOrganization = async (user: IUser, logger: FastifyBaseLogger): Promise<Schema.Types.ObjectId> => {
    const owned = await UserOrganization.findOne({
        userId: user._id,
        role: RoleInOrganization.OWNER,
        invitationToken: null
    }).sort({ createdAt: 1 })

    if (owned) {
        return owned.organizationId as unknown as Schema.Types.ObjectId
    }

    const name = organizationNameFor(user)
    const organization = await new Organization({ name, slug: slugify(name) }).save()
    await new UserOrganization({
        userId: user._id,
        organizationId: organization._id,
        role: RoleInOrganization.OWNER
    }).save()

    logger.info(`Created organization "${name}" for ${user.email}`)
    return organization._id as unknown as Schema.Types.ObjectId
}

/**
 * Who should own the organization a project moves into.
 *
 * The project owner, by seniority when there are several. Falling back to the most senior member of
 * any role covers projects whose owner row was lost: somebody has to be able to administer them, and
 * a project nobody can administer is worse than a viewer promoted to owner of their own organization.
 */
const findOrganizationOwnerFor = async (projectId: Schema.Types.ObjectId, logger: FastifyBaseLogger): Promise<IUser | undefined> => {
    const candidates = await UserProject.find({ projectId, invitationToken: null }).sort({ createdAt: 1 })
    const owners = candidates.filter(candidate => candidate.role === RoleInProject.OWNER)

    for (const candidate of [...owners, ...candidates]) {
        const user = await User.findById(candidate.userId)
        if (user) {
            if (candidate.role !== RoleInProject.OWNER) {
                logger.warn(`Project ${projectId.toString()} has no owner: ${user.email} (${candidate.role}) becomes the owner of its organization`)
            }
            return user
        }
    }

    return undefined
}

/** The organization that collects the projects with nobody attached to them at all. */
const findOrCreateFallbackOrganization = async (logger: FastifyBaseLogger): Promise<Schema.Types.ObjectId> => {
    const existing = await Organization.findOne({ name: FALLBACK_ORGANIZATION_NAME })
    if (existing) {
        return existing._id as unknown as Schema.Types.ObjectId
    }

    const organization = await new Organization({
        name: FALLBACK_ORGANIZATION_NAME,
        slug: slugify(FALLBACK_ORGANIZATION_NAME),
        description: "Projects migrated with no user attached to them"
    }).save()

    logger.warn(`Created "${FALLBACK_ORGANIZATION_NAME}": it holds projects with no member, and needs an owner assigning by hand`)
    return organization._id as unknown as Schema.Types.ObjectId
}

/**
 * Moves every member of a project into the organization the project now belongs to.
 *
 * Pending project invitations are included, as plain members: that is the same shape a project
 * invitation writes today, and leaving them out would put the invitee in front of an invitation to a
 * project inside an organization they do not belong to. Whoever already holds a role keeps it — the
 * owner of the organization must not be demoted by one of their own projects.
 */
const attachProjectMembers = async (projectId: Schema.Types.ObjectId, organizationId: Schema.Types.ObjectId): Promise<number> => {
    const memberships = await UserProject.find({ projectId })
    let attached = 0

    for (const membership of memberships) {
        const existing = await UserOrganization.findOne({ userId: membership.userId, organizationId })
        if (existing) {
            continue
        }

        // A pending invitation never grants more than plain membership, whatever role it was for:
        // an unanswered invitation to own a project must not already hand over every project of the
        // organization.
        const role = membership.invitationToken ? RoleInOrganization.MEMBER : (ORGANIZATION_ROLE_BY_PROJECT_ROLE[membership.role] ?? RoleInOrganization.MEMBER)

        await new UserOrganization({
            userId: membership.userId,
            organizationId,
            role
        }).save()
        attached++
    }

    return attached
}

/**
 * Gives every project written before organizations existed the organization it belongs to.
 *
 * One organization per project owner, holding all of their projects: an installation serving several
 * customers keeps them apart, which a single shared organization would not. The members of those
 * projects join the same organization, with the role their project role converts into.
 *
 * Idempotent by construction — it only ever looks at projects that still have no organization — so it
 * is safe on every boot, and costs one empty query once there is nothing left to move.
 */
export const migrateProjectsToOrganizations = async (logger: FastifyBaseLogger): Promise<void> => {
    const pending = await Project.find(WITHOUT_ORGANIZATION).sort({ createdAt: 1 })
    if (pending.length === 0) {
        return
    }

    logger.info(`Migrating ${pending.length} project(s) into organizations`)

    // Grouped by owner before anything is written, so all the projects of one owner land in the same
    // organization however they are ordered in the collection.
    const projectsByOwner = new Map<string, { owner?: IUser; projects: Schema.Types.ObjectId[] }>()

    for (const project of pending) {
        const projectId = project._id as unknown as Schema.Types.ObjectId
        const owner = await findOrganizationOwnerFor(projectId, logger)
        const key = owner ? owner._id.toString() : "__no_owner__"
        const group = projectsByOwner.get(key) ?? { owner, projects: [] }
        group.projects.push(projectId)
        projectsByOwner.set(key, group)
    }

    let migratedProjects = 0
    let attachedMembers = 0

    for (const [, group] of projectsByOwner) {
        // Not wrapped in a transaction: what makes an interrupted run safe here is that it can be run
        // again, not that a group is atomic. A run stopping halfway leaves the owners already done
        // done, and the next one starts from the projects that still have no organization, reusing
        // the organization the previous pass opened for that owner.
        const organizationId = group.owner ? await findOrCreateOwnedOrganization(group.owner, logger) : await findOrCreateFallbackOrganization(logger)

        for (const projectId of group.projects) {
            await Project.updateOne({ _id: projectId }, { $set: { organizationId } })
            attachedMembers += await attachProjectMembers(projectId, organizationId)
            migratedProjects++
        }
    }

    logger.info(`Migrated ${migratedProjects} project(s) into organizations, attaching ${attachedMembers} membership(s)`)
}
