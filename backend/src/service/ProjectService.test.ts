import { ObjectId, Types } from "mongoose"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// The service reaches the application instance for its logger; importing the real one would boot
// Fastify, connect to the configured database and run the migrations.
vi.mock("..", () => ({
    fastify: { log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }, config: {} }
}))

import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import CodeRepository from "../models/CodeRepositoryModel"
import Microfrontend from "../models/MicrofrontendModel"
import Project from "../models/ProjectModel"
import { IUser } from "../models/UserModel"
import UserOrganization, { RoleInOrganization } from "../models/UserOrganizationModel"
import UserProject from "../models/UserProjectModel"
import CodeRepositoryImportService from "./CodeRepositoryImportService"
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

    it("Given a context, when the project is updated, then the context is written", async () => {
        await update({ context: "## Conventions\n- strict TypeScript" })

        expect(written).toEqual({ context: "## Conventions\n- strict TypeScript" })
    })

    it("Given a null description and a null context, when the project is updated, then both are unset", async () => {
        await update({ description: null, context: null })

        expect(written).toEqual({ $unset: { description: 1, context: 1 } })
    })
})

describe("update of the pipeline templates", () => {
    const projectId = newId()
    const connectionId = newId()
    const repository = { repositoryId: "7", name: "acme-pipelines", cloneUrlHttps: "https://github.com/acme/acme-pipelines.git" }
    let written: Record<string, unknown> | undefined
    let findConnection: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        written = undefined
        vi.spyOn(ProjectService.prototype as unknown as WithAuthorizationGate, "ensureAccessToProject").mockResolvedValue(undefined)
        vi.spyOn(Project, "findById").mockResolvedValue({ _id: projectId, organizationId: newId() } as never)
        vi.spyOn(Project, "findByIdAndUpdate").mockImplementation(((_id: unknown, update: Record<string, unknown>) => {
            written = update
            return Promise.resolve({ name: "whatever" })
        }) as never)
        // An owner of the project
        vi.spyOn(UserProject, "findOne").mockResolvedValue({ role: "OWNER" } as never)
        findConnection = vi.spyOn(CodeRepository, "findOne").mockResolvedValue({ _id: connectionId, projectId, name: "GitHub" } as never)
        vi.spyOn(CodeRepositoryImportService.prototype, "fetchRepositories").mockResolvedValue([repository])
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    const update = (pipelines: unknown) => new ProjectService(aUser()).update(String(projectId), { pipelines } as never)

    it("Given a repository the connection of the project reaches, when the project is updated, then it is linked with its ref", async () => {
        await update({ codeRepositoryId: String(connectionId), repositoryId: "7", ref: " release/v2 " })

        const filter = findConnection.mock.calls[0][0] as Record<string, unknown>
        expect({ ...filter, _id: String(filter._id), projectId: String(filter.projectId) }).toEqual({ _id: String(connectionId), projectId: String(projectId), isActive: true })
        expect(written).toEqual({
            pipelines: { codeRepository: expect.objectContaining({ enabled: true, codeRepositoryId: connectionId, repositoryId: "7", name: "acme-pipelines" }), ref: "release/v2" }
        })
    })

    it("Given no ref, when the project is updated, then none is stored: the default branch is read", async () => {
        await update({ codeRepositoryId: String(connectionId), repositoryId: "7", ref: "" })

        expect(written).toEqual({ pipelines: expect.not.objectContaining({ ref: expect.anything() }) })
    })

    it("Given null, when the project is updated, then the official pipeline templates are used again", async () => {
        await update(null)

        expect(written).toEqual({ $unset: { pipelines: 1 } })
    })

    /** A connection of another project would lend this one its access token */
    it("Given a connection of another project, when the project is updated, then it is refused and nothing is written", async () => {
        findConnection.mockResolvedValue(null as never)

        await expect(update({ codeRepositoryId: String(newId()), repositoryId: "7" })).rejects.toMatchObject({ code: "PIPELINES_REPOSITORY_INVALID" })
        expect(written).toBeUndefined()
    })

    it("Given a repository the connection cannot reach, when the project is updated, then it is refused", async () => {
        await expect(update({ codeRepositoryId: String(connectionId), repositoryId: "999" })).rejects.toMatchObject({ code: "PIPELINES_REPOSITORY_INVALID" })
        expect(written).toBeUndefined()
    })

    it.each([
        ["no connection", { repositoryId: "7" }],
        ["a connection id that is not one", { codeRepositoryId: "c0ffee", repositoryId: "7" }],
        ["no repository", { codeRepositoryId: "aaaaaaaaaaaaaaaaaaaaaaaa" }]
    ])("Given %s, when the project is updated, then it is refused with a 400 and nothing is written", async (_case, pipelines) => {
        await expect(update(pipelines)).rejects.toMatchObject({ code: "PIPELINES_REPOSITORY_REQUIRED", statusCode: 400 })
        expect(written).toBeUndefined()
    })

    it.each([
        ["with ..", "release/../main"],
        ["starting with a dash", "-x"],
        ["with a space", "my branch"],
        ["ending with .lock", "main.lock"],
        ["that is not a string", 42]
    ])("Given a ref %s, when the project is updated, then it is refused with a 400 and nothing is written", async (_case, ref) => {
        await expect(update({ codeRepositoryId: String(connectionId), repositoryId: "7", ref })).rejects.toMatchObject({ code: "PIPELINES_REF_INVALID", statusCode: 400 })
        expect(written).toBeUndefined()
    })

    it("Given a member who is not an owner, when the pipeline templates are changed or cleared, then it is refused", async () => {
        vi.mocked(UserProject.findOne).mockResolvedValue({ role: "MEMBER" } as never)
        vi.spyOn(ProjectService.prototype as unknown as { isOrganizationAdmin: () => Promise<boolean> }, "isOrganizationAdmin").mockResolvedValue(false)

        await expect(update({ codeRepositoryId: String(connectionId), repositoryId: "7" })).rejects.toMatchObject({ code: "PIPELINES_OWNER_REQUIRED", statusCode: 403 })
        await expect(update(null)).rejects.toMatchObject({ code: "PIPELINES_OWNER_REQUIRED", statusCode: 403 })
        expect(written).toBeUndefined()
    })
})

describe("getContext", () => {
    const projectId = String(newId())
    const microfrontendId = newId()
    let microfrontendFilter: Record<string, unknown> | undefined

    beforeEach(() => {
        microfrontendFilter = undefined
        vi.spyOn(ProjectService.prototype, "findById").mockResolvedValue({ _id: newId(), name: "Portal", context: "shared rules" } as never)
        vi.spyOn(Microfrontend, "find").mockImplementation(((filter: Record<string, unknown>) => {
            microfrontendFilter = filter
            return { sort: () => Promise.resolve([{ _id: microfrontendId, slug: "catalog", name: "Catalog", context: "catalog rules" }]) }
        }) as never)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it("Given a project and a microfrontend with a context, when the context is read, then both come back", async () => {
        const context = await new ProjectService(aUser()).getContext(projectId)

        expect(context.project).toMatchObject({ name: "Portal", context: "shared rules" })
        expect(context.microfrontends).toEqual([expect.objectContaining({ slug: "catalog", context: "catalog rules" })])
    })

    it("Given microfrontends without a context, when the context is read, then they are left out by the query", async () => {
        await new ProjectService(aUser()).getContext(projectId)

        expect(microfrontendFilter).toMatchObject({ context: { $nin: [null, ""] } })
    })

    it("Given a microfrontend of the project, when its context is read, then only its own comes back with the project's", async () => {
        vi.spyOn(Microfrontend, "exists").mockResolvedValue({ _id: microfrontendId } as never)

        const context = await new ProjectService(aUser()).getContext(projectId, { microfrontendId: String(microfrontendId) })

        expect(context.project).toMatchObject({ context: "shared rules" })
        expect(String(microfrontendFilter?._id)).toBe(String(microfrontendId))
    })

    it("Given a microfrontend of another project, when its context is read, then it is not found", async () => {
        vi.spyOn(Microfrontend, "exists").mockResolvedValue(null as never)

        await expect(new ProjectService(aUser()).getContext(projectId, { microfrontendId: String(microfrontendId) })).rejects.toBeInstanceOf(EntityNotFoundError)
        expect(microfrontendFilter).toBeUndefined()
    })
})
