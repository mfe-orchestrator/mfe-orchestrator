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
    surname?: string
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

/** The database this migration is run against, rebuilt for every test. */
let users: FakeUser[]
let projects: FakeProject[]
let memberships: FakeMembership[]
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

/** A result that can be awaited straight away or sorted first, as the migration does both. */
const queryResult = <T>(value: T) => ({
    sort: () => Promise.resolve(value),
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
        createdOrganizations = []
        createdMemberships = []
        assignedProjects = {}

        vi.spyOn(Project, "find").mockImplementation((() => queryResult(projects)) as never)
        vi.spyOn(Project, "updateOne").mockImplementation((({ _id }: { _id: Types.ObjectId }, update: { $set: { organizationId: Types.ObjectId } }) => {
            assignedProjects[_id.toString()] = update.$set.organizationId.toString()
            return Promise.resolve({ modifiedCount: 1 })
        }) as never)

        vi.spyOn(UserProject, "find").mockImplementation((({ projectId, invitationToken }: { projectId: Types.ObjectId; invitationToken?: null }) =>
            queryResult(
                memberships
                    .filter(membership => membership.projectId.toString() === projectId.toString())
                    // `invitationToken: null` in a filter means "not pending", the way mongoose reads it
                    .filter(membership => (invitationToken === null ? !membership.invitationToken : true))
            )) as never)

        vi.spyOn(User, "findById").mockImplementation(((id: Types.ObjectId) => Promise.resolve(users.find(user => user._id.toString() === id?.toString()) ?? null)) as never)

        vi.spyOn(Organization, "findOne").mockImplementation((({ name }: { name: string }) => queryResult(createdOrganizations.find(organization => organization.name === name) ?? null)) as never)

        vi.spyOn(UserOrganization, "findOne").mockImplementation((({ userId, organizationId, role }: { userId: Types.ObjectId; organizationId?: Types.ObjectId; role?: RoleInOrganization }) =>
            queryResult(
                createdMemberships.find(
                    membership =>
                        membership.userId === userId.toString() &&
                        (organizationId === undefined || membership.organizationId === organizationId.toString()) &&
                        (role === undefined || membership.role === role)
                ) ?? null
            )) as never)

        vi.spyOn(Organization.prototype, "save").mockImplementation(function (this: { _id: Types.ObjectId; name: string }) {
            createdOrganizations.push({ _id: this._id, name: this.name })
            return Promise.resolve(this) as never
        })

        vi.spyOn(UserOrganization.prototype, "save").mockImplementation(function (this: {
            userId: Types.ObjectId
            organizationId: Types.ObjectId
            role: RoleInOrganization
        }) {
            createdMemberships.push({ userId: this.userId.toString(), organizationId: this.organizationId.toString(), role: this.role })
            return Promise.resolve(this) as never
        })
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

    /** The invitee has to be inside the organization, or the project they are invited to would sit in a tenant they do not belong to. */
    it("Given a project with a pending invitation, when it is migrated, then the invitee is already a member of the organization", async () => {
        const owner = aUser("owner@example.com", "Ada")
        const invitee = aUser("invitee@example.com")
        const project = aProject("checkout")
        aMembership(owner, project, RoleInProject.OWNER)
        aMembership(invitee, project, RoleInProject.MEMBER, { invitationToken: "a-pending-token" })

        await migrateProjectsToOrganizations(logger)

        expect(roleOf(invitee)).toBe(RoleInOrganization.MEMBER)
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
        createdMemberships.push({ userId: owner._id.toString(), organizationId: existingOrganizationId.toString(), role: RoleInOrganization.OWNER })
        const project = aProject("checkout")
        aMembership(owner, project, RoleInProject.OWNER)

        await migrateProjectsToOrganizations(logger)

        expect(createdOrganizations).toHaveLength(0)
        expect(organizationOf(project)).toBe(existingOrganizationId.toString())
    })

    it("Given no project left without an organization, when the migration runs again, then it writes nothing", async () => {
        await migrateProjectsToOrganizations(logger)

        expect(createdOrganizations).toHaveLength(0)
        expect(createdMemberships).toHaveLength(0)
        expect(assignedProjects).toEqual({})
    })
})
