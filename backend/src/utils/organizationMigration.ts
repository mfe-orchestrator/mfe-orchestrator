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

type Id = Schema.Types.ObjectId

/** One project membership, as the planning below needs to read it. */
interface Membership {
    userId: Id
    projectId: Id
    role: RoleInProject
    invitationToken?: string
    createdAt: Date
}

/** What to call the organization of a user, from whatever the account actually carries. */
const organizationNameFor = (user: IUser): string => {
    const fullName = [user.name, user.surname].filter(Boolean).join(" ").trim()
    const base = fullName || user.email?.split("@")[0] || "My"
    return `${base} workspace`
}

/**
 * Who should own the organization a project moves into.
 *
 * The project owner, by seniority when there are several. Falling back to the most senior member of
 * any role covers projects whose owner row was lost: somebody has to be able to administer them, and
 * a project nobody can administer is worse than a viewer promoted to owner of their own organization.
 *
 * Pending invitations are not candidates at all: an invitation is not a membership, so it cannot be
 * what decides who owns a tenant.
 */
const pickOwner = (memberships: Membership[], usersById: Map<string, IUser>, logger: FastifyBaseLogger, projectId: Id): IUser | undefined => {
    const accepted = memberships.filter(membership => !membership.invitationToken).sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
    const bySeniority = [...accepted.filter(membership => membership.role === RoleInProject.OWNER), ...accepted]

    for (const candidate of bySeniority) {
        const user = usersById.get(candidate.userId.toString())
        if (user) {
            if (candidate.role !== RoleInProject.OWNER) {
                logger.warn(`Project ${projectId.toString()} has no owner: ${user.email} (${candidate.role}) becomes the owner of its organization`)
            }
            return user
        }
    }

    return undefined
}

/**
 * Gives every project written before organizations existed the organization it belongs to.
 *
 * One organization per project owner, holding all of their projects: an installation serving several
 * customers keeps them apart, which a single shared organization would not. The members of those
 * projects join the same organization, with the role their project role converts into.
 *
 * Written as a fixed number of round trips rather than a walk over the documents, because it runs
 * before the application starts serving: a migration whose duration grows with the dataset can push
 * the boot past the plugin timeout, and an installation large enough would never come up at all.
 *
 * Idempotent by construction — it only ever looks at projects that still have no organization — so it
 * is safe on every boot, and costs one empty query once there is nothing left to move.
 */
export const migrateProjectsToOrganizations = async (logger: FastifyBaseLogger): Promise<void> => {
    const pending = await Project.find(WITHOUT_ORGANIZATION, { _id: 1 }).lean()
    if (pending.length === 0) {
        return
    }

    logger.info(`Migrating ${pending.length} project(s) into organizations`)

    const projectIds = pending.map(project => project._id as unknown as Id)

    // Everything the plan needs, read up front: the memberships of those projects, the accounts behind
    // them, and the organizations those accounts already own.
    const memberships = (await UserProject.find({ projectId: { $in: projectIds } }).lean()) as unknown as Membership[]
    // Deduplicated by their string form, but kept as identifiers: a filter built on strings would not
    // match a field declared as an object id.
    const userIdByKey = new Map(memberships.map(membership => [membership.userId.toString(), membership.userId]))
    const userIds = [...userIdByKey.values()]
    const users = await User.find({ _id: { $in: userIds } }, { email: 1, name: 1, surname: 1 }).lean<IUser[]>()
    const usersById = new Map(users.map(user => [user._id.toString(), user]))

    const membershipsByProject = new Map<string, Membership[]>()
    for (const membership of memberships) {
        const key = membership.projectId.toString()
        membershipsByProject.set(key, [...(membershipsByProject.get(key) ?? []), membership])
    }

    // Reusing an organization the account already owns is what makes the migration safe to interrupt:
    // a second run keeps filling the one the previous pass created instead of opening another beside it.
    const owned = await UserOrganization.find({ userId: { $in: userIds }, role: RoleInOrganization.OWNER, invitationToken: null })
        .sort({ createdAt: 1 })
        .lean()
    const ownedOrganizationByUser = new Map<string, Id>()
    for (const row of owned) {
        const key = row.userId.toString()
        if (!ownedOrganizationByUser.has(key)) {
            ownedOrganizationByUser.set(key, row.organizationId as unknown as Id)
        }
    }

    // Which organization each project moves into, and which organizations have to be opened for it.
    const projectIdByKey = new Map(projectIds.map(projectId => [projectId.toString(), projectId]))
    const organizationByProject = new Map<string, Id>()
    /** The organizations to open, by the id mongoose assigns on construction: the plan can reference it before the write. */
    const documentsToInsert = new Map<string, InstanceType<typeof Organization>>()
    const plannedOrganizationByUser = new Map<string, { organizationId: Id; ownerId: Id }>()
    let fallbackOrganizationId: Id | undefined

    const planOrganization = (name: string): Id => {
        const organization = new Organization({ name, slug: slugify(name) })
        const id = organization._id as unknown as Id
        documentsToInsert.set(id.toString(), organization)
        return id
    }

    for (const projectId of projectIds) {
        const projectMemberships = membershipsByProject.get(projectId.toString()) ?? []
        const owner = pickOwner(projectMemberships, usersById, logger, projectId)

        if (!owner) {
            if (!fallbackOrganizationId) {
                const existing = await Organization.findOne({ name: FALLBACK_ORGANIZATION_NAME }, { _id: 1 }).lean()
                if (existing) {
                    fallbackOrganizationId = existing._id as unknown as Id
                } else {
                    fallbackOrganizationId = planOrganization(FALLBACK_ORGANIZATION_NAME)
                    logger.warn(`Created "${FALLBACK_ORGANIZATION_NAME}": it holds projects with no member, and needs an owner assigning by hand`)
                }
            }
            organizationByProject.set(projectId.toString(), fallbackOrganizationId)
            continue
        }

        const ownerKey = owner._id.toString()
        let organizationId = ownedOrganizationByUser.get(ownerKey) ?? plannedOrganizationByUser.get(ownerKey)?.organizationId
        if (!organizationId) {
            const name = organizationNameFor(owner)
            organizationId = planOrganization(name)
            plannedOrganizationByUser.set(ownerKey, { organizationId, ownerId: owner._id as unknown as Id })
            logger.info(`Created organization "${name}" for ${owner.email}`)
        }
        organizationByProject.set(projectId.toString(), organizationId)
    }

    if (documentsToInsert.size > 0) {
        await Organization.insertMany([...documentsToInsert.values()], { ordered: false })
    }

    // The owner of each organization just opened, plus every member the projects bring with them.
    const rowsToInsert: { userId: Id; organizationId: Id; role: RoleInOrganization }[] = []
    for (const { organizationId, ownerId } of plannedOrganizationByUser.values()) {
        rowsToInsert.push({ userId: ownerId, organizationId, role: RoleInOrganization.OWNER })
    }

    for (const membership of memberships) {
        const organizationId = organizationByProject.get(membership.projectId.toString())
        if (!organizationId) {
            continue
        }
        // A pending invitation never grants more than plain membership, whatever role it was for: an
        // unanswered invitation to own a project must not already hand over every project of the
        // organization.
        const role = membership.invitationToken ? RoleInOrganization.MEMBER : (ORGANIZATION_ROLE_BY_PROJECT_ROLE[membership.role] ?? RoleInOrganization.MEMBER)
        rowsToInsert.push({ userId: membership.userId, organizationId, role })
    }

    // Whoever already holds a role keeps it — the owner of an organization must not be demoted by one
    // of their own projects — so what is already there is read once and skipped.
    const organizationIds = [...new Map([...organizationByProject.values()].map(id => [id.toString(), id])).values()]
    const existing = await UserOrganization.find({ organizationId: { $in: organizationIds } }, { userId: 1, organizationId: 1 }).lean()
    const alreadyThere = new Set(existing.map(row => `${row.userId.toString()}:${row.organizationId.toString()}`))

    const deduplicated = new Map<string, { userId: Id; organizationId: Id; role: RoleInOrganization }>()
    for (const row of rowsToInsert) {
        const key = `${row.userId.toString()}:${row.organizationId.toString()}`
        if (alreadyThere.has(key) || deduplicated.has(key)) {
            continue
        }
        deduplicated.set(key, row)
    }

    if (deduplicated.size > 0) {
        // Unordered: a row that turns up in the meantime must not take the whole batch down with it.
        await UserOrganization.insertMany([...deduplicated.values()], { ordered: false })
    }

    await Project.bulkWrite(
        [...organizationByProject.entries()].map(([key, organizationId]) => ({
            updateOne: { filter: { _id: projectIdByKey.get(key) }, update: { $set: { organizationId } } }
        }))
    )

    logger.info(`Migrated ${organizationByProject.size} project(s) into organizations, attaching ${deduplicated.size} membership(s)`)
}
