import { FastifyBaseLogger } from "fastify"
import { Types } from "mongoose"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import Organization from "../models/OrganizationModel"
import Project from "../models/ProjectModel"
import User from "../models/UserModel"
import UserOrganization, { RoleInOrganization } from "../models/UserOrganizationModel"
import UserProject, { RoleInProject } from "../models/UserProjectModel"
import { migrateProjectsToOrganizations } from "./organizationMigration"

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as FastifyBaseLogger

interface FakeUser {
    _id: Types.ObjectId
    email: string
    name?: string
}

interface FakeProject {
    _id: Types.ObjectId
    name: string
}

interface FakeMembership {
    userId: Types.ObjectId
    projectId: Types.ObjectId
    role: RoleInProject
    invitationToken?: string
    createdAt: Date
}

/** The database the migration is run against, rebuilt for every test. */
let users: FakeUser[]
let projects: FakeProject[]
let memberships: FakeMembership[]
/** Organization memberships already stored before the migration runs. */
let existingMemberships: { userId: Types.ObjectId; organizationId: Types.ObjectId; role: RoleInOrganization; invitationToken?: string }[]
/** What the migration wrote: organizations opened, memberships created, projects reassigned. */
let createdOrganizations: { _id: Types.ObjectId; name: string }[]
let createdMemberships: { userId: string; organizationId: string; role: RoleInOrganization }[]
let assignedProjects: Record<string, string>

const aUser = (email: string, name?: string): FakeUser => {
    const user = { _id: new Types.ObjectId(), email, name }
    users.push(user)
    return user
}

const aProject = (name: string): FakeProject => {
    const project = { _id: new Types.ObjectId(), name }
    projects.push(project)
    return project
}

const aMembership = (user: FakeUser, project: FakeProject, role: RoleInProject, options: { invitationToken?: string; joinedAt?: Date } = {}) => {
    memberships.push({
        userId: user._id,
        projectId: project._id,
        role,
        invitationToken: options.invitationToken,
        createdAt: options.joinedAt ?? new Date("2026-01-01T00:00:00Z")
    })
}

/** A result that can be awaited, sorted or leaned on, as the migration does all three. */
const queryResult = <T>(value: T): { sort: () => unknown; lean: () => Promise<T>; then: (resolve: (value: T) => unknown) => unknown } => ({
    sort: () => queryResult(value),
    lean: () => Promise.resolve(value),
    then: (resolve: (value: T) => unknown) => resolve(value)
})

const organizationOf = (project: FakeProject) => assignedProjects[project._id.toString()]

const membershipsOf = (organizationId: string) => createdMemberships.filter(membership => membership.organizationId === organizationId)

const roleOf = (user: FakeUser, organizationId?: string) =>
    createdMemberships.find(membership => membership.userId === user._id.toString() && (!organizationId || membership.organizationId === organizationId))?.role

describe("migrateProjectsToOrganizations", () => {
    beforeEach(() => {
        users = []
        projects = []
        memberships = []
        existingMemberships = []
        createdOrganizations = []
        createdMemberships = []
        assignedProjects = {}

        vi.spyOn(Project, "find").mockImplementation((() => queryResult(projects)) as never)

        vi.spyOn(Project, "bulkWrite").mockImplementation(((operations: { updateOne: { filter: { _id: Types.ObjectId }; update: { $set: { organizationId: Types.ObjectId } } } }[]) => {
            for (const operation of operations) {
                assignedProjects[operation.updateOne.filter._id.toString()] = operation.updateOne.update.$set.organizationId.toString()
            }
            return Promise.resolve({ modifiedCount: operations.length })
        }) as never)

        // Every membership of the projects being migrated, in one read.
        vi.spyOn(UserProject, "find").mockImplementation((() => queryResult(memberships)) as never)
        vi.spyOn(User, "find").mockImplementation((() => queryResult(users)) as never)

        vi.spyOn(Organization, "findOne").mockImplementation((({ name }: { name: string }) => queryResult(createdOrganizations.find(organization => organization.name === name) ?? null)) as never)

        vi.spyOn(Organization, "insertMany").mockImplementation(((documents: { _id: Types.ObjectId; name: string }[]) => {
            createdOrganizations.push(...documents.map(document => ({ _id: document._id, name: document.name })))
            return Promise.resolve(documents)
        }) as never)

        // Serves both reads the migration does on this collection: the organizations an account already
        // owns, and the rows that must not be written over.
        vi.spyOn(UserOrganization, "find").mockImplementation((() => queryResult(existingMemberships)) as never)

        vi.spyOn(UserOrganization, "insertMany").mockImplementation(((rows: { userId: Types.ObjectId; organizationId: Types.ObjectId; role: RoleInOrganization }[]) => {
            createdMemberships.push(...rows.map(row => ({ userId: row.userId.toString(), organizationId: row.organizationId.toString(), role: row.role })))
            return Promise.resolve(rows)
        }) as never)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it("Given several projects of the same owner, when they are migrated, then all of them land in that owner's single organization", async () => {
        const owner = aUser("owner@example.com", "Ada")
        const first = aProject("checkout")
        const second = aProject("catalogue")
        aMembership(owner, first, RoleInProject.OWNER)
        aMembership(owner, second, RoleInProject.OWNER)

        await migrateProjectsToOrganizations(logger)

        expect(createdOrganizations).toHaveLength(1)
        expect(createdOrganizations[0].name).toBe("Ada workspace")
        expect(organizationOf(first)).toBe(createdOrganizations[0]._id.toString())
        expect(organizationOf(second)).toBe(createdOrganizations[0]._id.toString())
    })

    it("Given two projects owned by different users, when they are migrated, then each owner gets their own organization", async () => {
        const first = aProject("checkout")
        const second = aProject("catalogue")
        aMembership(aUser("first@example.com", "Ada"), first, RoleInProject.OWNER)
        aMembership(aUser("second@example.com", "Grace"), second, RoleInProject.OWNER)

        await migrateProjectsToOrganizations(logger)

        expect(createdOrganizations).toHaveLength(2)
        expect(organizationOf(first)).not.toBe(organizationOf(second))
    })

    it("Given a project with members beside its owner, when it is migrated, then they join the same organization as plain members", async () => {
        const owner = aUser("owner@example.com", "Ada")
        const member = aUser("member@example.com")
        const viewer = aUser("viewer@example.com")
        const project = aProject("checkout")
        aMembership(owner, project, RoleInProject.OWNER, { joinedAt: new Date("2026-01-01T00:00:00Z") })
        aMembership(member, project, RoleInProject.MEMBER, { joinedAt: new Date("2026-02-01T00:00:00Z") })
        aMembership(viewer, project, RoleInProject.VIEWER, { joinedAt: new Date("2026-03-01T00:00:00Z") })

        await migrateProjectsToOrganizations(logger)

        const organizationId = organizationOf(project)
        expect(membershipsOf(organizationId)).toHaveLength(3)
        expect(roleOf(owner)).toBe(RoleInOrganization.OWNER)
        expect(roleOf(member)).toBe(RoleInOrganization.MEMBER)
        expect(roleOf(viewer)).toBe(RoleInOrganization.MEMBER)
    })

    /** Two project owners cannot both own the organization, but neither of them should lose the administration they had. */
    it("Given a project with a second owner, when it is migrated, then the most senior owns the organization and the other administers it", async () => {
        const firstOwner = aUser("first@example.com", "Ada")
        const secondOwner = aUser("second@example.com", "Grace")
        const project = aProject("checkout")
        aMembership(firstOwner, project, RoleInProject.OWNER, { joinedAt: new Date("2026-01-01T00:00:00Z") })
        aMembership(secondOwner, project, RoleInProject.OWNER, { joinedAt: new Date("2026-06-01T00:00:00Z") })

        await migrateProjectsToOrganizations(logger)

        expect(roleOf(firstOwner)).toBe(RoleInOrganization.OWNER)
        expect(roleOf(secondOwner)).toBe(RoleInOrganization.ADMIN)
    })

    /** L'invitato deve stare dentro l'organizzazione, o il progetto a cui è invitato vivrebbe in un tenant che non lo comprende. */
    it("Given a project with a pending invitation, when it is migrated, then the invitee is already a member of the organization", async () => {
        const owner = aUser("owner@example.com", "Ada")
        const invitee = aUser("invitee@example.com")
        const project = aProject("checkout")
        aMembership(owner, project, RoleInProject.OWNER)
        aMembership(invitee, project, RoleInProject.MEMBER, { invitationToken: "a-pending-token" })

        await migrateProjectsToOrganizations(logger)

        expect(roleOf(invitee)).toBe(RoleInOrganization.MEMBER)
    })

    /** A pending invitation never grants more than plain membership, whatever role it was for. */
    it("Given a pending invitation to own the project, when it is migrated, then it does not become administration of the organization", async () => {
        const owner = aUser("owner@example.com", "Ada")
        const invitedOwner = aUser("invited@example.com")
        const project = aProject("checkout")
        aMembership(owner, project, RoleInProject.OWNER)
        aMembership(invitedOwner, project, RoleInProject.OWNER, { invitationToken: "a-pending-token" })

        await migrateProjectsToOrganizations(logger)

        expect(roleOf(invitedOwner)).toBe(RoleInOrganization.MEMBER)
    })

    /** A pending invitation is not a membership, so it cannot be what decides who owns the organization. */
    it("Given a project whose only owner row is a pending invitation, when it is migrated, then an accepted member owns the organization instead", async () => {
        const invitedOwner = aUser("invited@example.com", "Ada")
        const member = aUser("member@example.com", "Grace")
        const project = aProject("checkout")
        aMembership(invitedOwner, project, RoleInProject.OWNER, { invitationToken: "a-pending-token" })
        aMembership(member, project, RoleInProject.MEMBER)

        await migrateProjectsToOrganizations(logger)

        expect(createdOrganizations[0].name).toBe("Grace workspace")
        expect(roleOf(member)).toBe(RoleInOrganization.OWNER)
        expect(roleOf(invitedOwner)).toBe(RoleInOrganization.MEMBER)
    })

    it("Given a project with nobody attached to it, when it is migrated, then it ends up in the fallback organization", async () => {
        const project = aProject("abandoned")

        await migrateProjectsToOrganizations(logger)

        expect(createdOrganizations[0].name).toBe("Default organization")
        expect(organizationOf(project)).toBe(createdOrganizations[0]._id.toString())
        expect(logger.warn).toHaveBeenCalled()
    })

    /** What makes the migration safe to interrupt: a second pass must fill the organization already opened, not a new one. */
    it("Given an owner who already has an organization, when a further project of theirs is migrated, then no second organization is opened", async () => {
        const owner = aUser("owner@example.com", "Ada")
        const existingOrganizationId = new Types.ObjectId()
        existingMemberships.push({ userId: owner._id, organizationId: existingOrganizationId, role: RoleInOrganization.OWNER })
        const project = aProject("checkout")
        aMembership(owner, project, RoleInProject.OWNER)

        await migrateProjectsToOrganizations(logger)

        expect(createdOrganizations).toHaveLength(0)
        expect(organizationOf(project)).toBe(existingOrganizationId.toString())
    })

    /** Whoever already holds a role keeps it: the owner of an organization must not be demoted by one of their own projects. */
    it("Given a member who already belongs to the organization, when the project is migrated, then their row is left alone", async () => {
        const owner = aUser("owner@example.com", "Ada")
        const existingOrganizationId = new Types.ObjectId()
        existingMemberships.push({ userId: owner._id, organizationId: existingOrganizationId, role: RoleInOrganization.OWNER })
        const project = aProject("checkout")
        aMembership(owner, project, RoleInProject.MEMBER)

        await migrateProjectsToOrganizations(logger)

        expect(createdMemberships).toHaveLength(0)
    })

    it("Given no project left without an organization, when the migration runs again, then it writes nothing", async () => {
        await migrateProjectsToOrganizations(logger)

        expect(createdOrganizations).toHaveLength(0)
        expect(createdMemberships).toHaveLength(0)
        expect(assignedProjects).toEqual({})
    })
})
