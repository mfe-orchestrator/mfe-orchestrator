import { ObjectId, Types } from "mongoose"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// The service reaches the application instance for its logger; importing the real one would boot
// Fastify, connect to the configured database and run the migrations.
vi.mock("..", () => ({
    fastify: { log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }, config: {} }
}))

import Project from "../models/ProjectModel"
import { IUser } from "../models/UserModel"
import UserOrganization, { RoleInOrganization } from "../models/UserOrganizationModel"
import UserProject from "../models/UserProjectModel"
import ProjectService from "./ProjectService"

/**
 * The id flavour the service signatures speak: mongoose's schema type, not the runtime one the driver
 * hands back. Spelled out once here so the tests read as scenarios instead of as casts.
 */
const newId = () => new Types.ObjectId() as unknown as ObjectId

interface FakeProject {
    _id: ObjectId
    name: string
    organizationId: ObjectId
}

const aUser = (): IUser => ({ _id: newId(), email: "someone@example.com" }) as unknown as IUser

let projects: FakeProject[]
let projectMemberships: { userId: ObjectId; projectId: ObjectId; invitationToken?: string }[]
let organizationMemberships: { userId: ObjectId; organizationId: ObjectId; role: RoleInOrganization }[]

const sameId = (left: unknown, right: unknown) => String(left) === String(right)

/** Applies the filter the service builds, so the tests can assert on projects instead of on query shapes. */
// biome-ignore lint/suspicious/noExplicitAny: a mongo filter is an arbitrarily nested plain object
const matches = (project: FakeProject, clause: Record<string, any>): boolean =>
    Object.entries(clause).every(([field, condition]) => {
        if (field === "$or") {
            return (condition as Record<string, unknown>[]).some(alternative => matches(project, alternative))
        }
        const value = project[field as keyof FakeProject]
        if (condition && typeof condition === "object" && "$in" in condition) {
            return (condition.$in as unknown[]).some(candidate => sameId(candidate, value))
        }
        return sameId(condition, value)
    })

describe("findMine", () => {
    beforeEach(() => {
        projects = []
        projectMemberships = []
        organizationMemberships = []

        vi.spyOn(Project, "find").mockImplementation(((filter: Record<string, unknown>) => ({
            sort: () => Promise.resolve(projects.filter(project => matches(project, filter as Record<string, unknown>)))
        })) as never)

        vi.spyOn(UserProject, "find").mockImplementation(((filter: Record<string, unknown>) => {
            const { userId, invitationToken } = filter as Record<string, unknown>
            return {
                lean: () => Promise.resolve(projectMemberships.filter(membership => sameId(membership.userId, userId) && (invitationToken === null ? !membership.invitationToken : true)))
            }
        }) as never)

        vi.spyOn(UserOrganization, "find").mockImplementation(((filter: Record<string, unknown>) => {
            const { userId, role } = filter as Record<string, unknown>
            const wantedRoles = (role as { $in?: RoleInOrganization[] })?.$in
            return {
                session: () => ({
                    lean: () => Promise.resolve(organizationMemberships.filter(membership => sameId(membership.userId, userId) && (wantedRoles === undefined || wantedRoles.includes(membership.role))))
                })
            }
        }) as never)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    const aProject = (name: string, organizationId: ObjectId): FakeProject => {
        const project = { _id: newId(), name, organizationId }
        projects.push(project)
        return project
    }

    const namesOf = async (user: IUser, organizationId?: ObjectId) => (await new ProjectService(user).findMine(user._id, organizationId as never)).map(project => project.name)

    it("Given a project they were invited to and one they administer, when the list is read, then both are returned", async () => {
        const user = aUser()
        const otherOrganization = newId()
        const ownOrganization = newId()
        const shared = aProject("shared", otherOrganization)
        aProject("own", ownOrganization)
        projectMemberships.push({ userId: user._id, projectId: shared._id })
        organizationMemberships.push({ userId: user._id, organizationId: ownOrganization, role: RoleInOrganization.OWNER })

        expect(await namesOf(user)).toEqual(["shared", "own"])
    })

    /** Both ways in point at the same project: it must show up once, not twice. */
    it("Given a project reachable both as a member and as an administrator, when the list is read, then it appears once", async () => {
        const user = aUser()
        const organizationId = newId()
        const project = aProject("checkout", organizationId)
        projectMemberships.push({ userId: user._id, projectId: project._id })
        organizationMemberships.push({ userId: user._id, organizationId, role: RoleInOrganization.ADMIN })

        expect(await namesOf(user)).toEqual(["checkout"])
    })

    it("Given projects in two organizations, when the list is narrowed to one, then only its projects are returned", async () => {
        const user = aUser()
        const first = newId()
        const second = newId()
        aProject("in-first", first)
        aProject("in-second", second)
        const userId = user._id
        organizationMemberships.push({ userId, organizationId: first, role: RoleInOrganization.OWNER }, { userId, organizationId: second, role: RoleInOrganization.OWNER })

        expect(await namesOf(user, first)).toEqual(["in-first"])
    })

    it("Given a pending invitation to a project, when the list is read, then the project is not one of theirs yet", async () => {
        const user = aUser()
        const project = aProject("checkout", newId())
        projectMemberships.push({ userId: user._id, projectId: project._id, invitationToken: "pending" })

        expect(await namesOf(user)).toEqual([])
    })

    it("Given a plain member of an organization with projects they were never invited to, when the list is read, then it is empty", async () => {
        const user = aUser()
        const organizationId = newId()
        aProject("someone-elses", organizationId)
        organizationMemberships.push({ userId: user._id, organizationId, role: RoleInOrganization.MEMBER })

        expect(await namesOf(user)).toEqual([])
    })
})

/** The protected gate the update goes through, surfaced so the spy has something to type against. */
interface WithAuthorizationGate {
    ensureAccessToProject: () => Promise<void>
}

describe("update", () => {
    /** What the service actually asks mongo to write, which is the whole point of these tests. */
    let written: Record<string, unknown> | undefined

    beforeEach(() => {
        written = undefined
        // The route carries no body schema, so authorization is the only gate before the write: stub
        // it open and watch what comes out the other side.
        vi.spyOn(ProjectService.prototype as unknown as WithAuthorizationGate, "ensureAccessToProject").mockResolvedValue(undefined)
        vi.spyOn(Project, "findByIdAndUpdate").mockImplementation(((_id: unknown, update: Record<string, unknown>) => {
            written = update
            return Promise.resolve({ name: "whatever" })
        }) as never)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    const update = (input: Record<string, unknown>) => new ProjectService(aUser()).update(String(newId()), input as never)

    it("Given a new name, when the project is updated, then the name is written", async () => {
        await update({ name: "Checkout" })

        expect(written).toEqual({ name: "Checkout" })
    })

    /**
     * The slug is part of the path already uploaded bundles live under, so it must survive a rename
     * even when the caller explicitly asks for a new one.
     */
    it("Given a slug in the request body, when the project is updated, then the slug is not written", async () => {
        await update({ name: "Checkout", slug: "something-else" })

        expect(written).toEqual({ name: "Checkout" })
    })

    it("Given an organization in the request body, when the project is updated, then the project is not moved to it", async () => {
        await update({ name: "Checkout", organizationId: String(newId()) })

        expect(written).toEqual({ name: "Checkout" })
    })

    it("Given a null description, when the project is updated, then the description is unset", async () => {
        await update({ description: null })

        expect(written).toEqual({ $unset: { description: 1 } })
    })

    it("Given only a description, when the project is updated, then the name is left alone", async () => {
        await update({ description: "the checkout flow" })

        expect(written).toEqual({ description: "the checkout flow" })
    })
})
