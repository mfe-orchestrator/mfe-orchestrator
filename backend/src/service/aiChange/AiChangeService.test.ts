import { Types } from "mongoose"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../..", () => ({
    fastify: { log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }, config: { REPOSITORIES_FOLDER: "/tmp/repos", REPOSITORIES_MAX_SIZE_MB: 500 } }
}))

const workingCopy = {
    dir: "/tmp/repos/acme/portal/catalog",
    prepare: vi.fn(),
    blobOid: vi.fn(),
    commitAndPush: vi.fn(),
    discardChanges: vi.fn()
}
const workspaceService = {
    open: vi.fn(async () => ({ target: { repositoryName: "catalog" }, workingCopy, defaultBranch: "main" })),
    prepare: vi.fn(async () => "head-commit"),
    openPullRequest: vi.fn(async () => "https://github.com/acme/catalog/pull/7")
}
vi.mock("../workspace/RepositoryWorkspaceService", () => ({
    // A function, not an arrow: the service calls it with `new`.
    default: vi.fn(function RepositoryWorkspaceService() {
        return workspaceService
    })
}))

import AiChangeJob from "../../models/AiChangeJobModel"
import AiChangeRequest, { AiChangeStatus } from "../../models/AiChangeRequestModel"
import Microfrontend from "../../models/MicrofrontendModel"
import Project from "../../models/ProjectModel"
import Service from "../../models/ServiceModel"
import { IUser } from "../../models/UserModel"
import UserProject, { RoleInProject } from "../../models/UserProjectModel"
import AiChangeJobService from "./AiChangeJobService"
import AiChangeService from "./AiChangeService"

type WithGates = { ensureAccessToProject: () => Promise<void>; ensureAccessToMicrofrontend: () => Promise<void>; isOrganizationAdmin: () => Promise<boolean> }

const user = { _id: new Types.ObjectId(), email: "ada@example.com", name: "Ada" } as unknown as IUser
const projectId = new Types.ObjectId()
const microfrontendId = new Types.ObjectId()
const serviceId = new Types.ObjectId()

const proposal = (overrides: Record<string, unknown> = {}) => ({
    _id: new Types.ObjectId(),
    projectId,
    microfrontendId,
    prompt: "Add a 404 page\nwith a link home",
    baseBranch: "main",
    status: AiChangeStatus.PROPOSED,
    summary: "Added the page",
    files: [
        { path: "src/pages/NotFound.tsx", action: "create", proposedContent: "export const NotFound = () => null\n" },
        { path: "src/App.tsx", action: "update", baseBlobOid: "app-blob", proposedContent: "new app\n" }
    ],
    ...overrides
})

describe("AiChangeService", () => {
    let role: RoleInProject
    let isAdmin: boolean
    let updates: Record<string, unknown>[]

    beforeEach(() => {
        role = RoleInProject.MEMBER
        isAdmin = false
        updates = []
        const gates = AiChangeService.prototype as unknown as WithGates
        vi.spyOn(gates, "ensureAccessToProject").mockResolvedValue(undefined)
        vi.spyOn(gates, "ensureAccessToMicrofrontend").mockResolvedValue(undefined)
        vi.spyOn(gates, "isOrganizationAdmin").mockImplementation(async () => isAdmin)
        vi.spyOn(UserProject, "findOne").mockImplementation((() => Promise.resolve({ role })) as never)
        vi.spyOn(Project, "findById").mockResolvedValue({ _id: projectId, organizationId: new Types.ObjectId(), name: "Shop" } as never)
        vi.spyOn(Microfrontend, "findById").mockResolvedValue({ _id: microfrontendId, projectId, slug: "catalog", name: "Catalog" } as never)
        vi.spyOn(AiChangeRequest, "updateOne").mockImplementation(((_filter: unknown, update: Record<string, unknown>) => {
            updates.push(update)
            return Promise.resolve({})
        }) as never)
        vi.spyOn(AiChangeRequest, "findByIdAndUpdate").mockImplementation(((_id: unknown, update: Record<string, unknown>) => Promise.resolve({ ...update })) as never)
        workingCopy.blobOid.mockImplementation(async (_commit: string, file: string) => (file === "src/App.tsx" ? "app-blob" : undefined))
        workingCopy.commitAndPush.mockResolvedValue("new-commit")
        vi.spyOn(AiChangeRequest, "exists").mockResolvedValue(null as never)
    })

    afterEach(() => {
        vi.restoreAllMocks()
        vi.clearAllMocks()
    })

    const service = () => new AiChangeService(user, { ANTHROPIC_API_KEY: "sk-test" })

    it("Given a viewer, when a change is requested, then it is refused before anything is created", async () => {
        role = RoleInProject.VIEWER
        const create = vi.spyOn(AiChangeRequest, "create")

        await expect(service().create({ kind: "microfrontend", id: microfrontendId.toString() }, { prompt: "Add a 404 page" })).rejects.toMatchObject({ statusCode: 403 })
        expect(create).not.toHaveBeenCalled()
    })

    it("Given a member, when a change is requested, then it runs as a job on that repository alone and its request comes back", async () => {
        const request = { _id: new Types.ObjectId(), jobId: new Types.ObjectId(), status: AiChangeStatus.PENDING }
        const start = vi.spyOn(AiChangeJobService.prototype, "start").mockResolvedValue({ job: {}, requests: [request] } as never)

        const created = await service().create({ kind: "microfrontend", id: microfrontendId.toString() }, { prompt: "Add a 404 page", baseBranch: " develop " })

        expect(created).toBe(request)
        expect(start).toHaveBeenCalledWith(
            { projectId, prompt: "Add a 404 page", scope: "selection", repositories: [{ component: expect.objectContaining({ kind: "microfrontend", slug: "catalog" }), baseBranch: "develop" }] },
            expect.anything()
        )
    })

    it("Given a chosen effort, when a change is requested, then the job it runs as reasons at it", async () => {
        const start = vi.spyOn(AiChangeJobService.prototype, "start").mockResolvedValue({ job: {}, requests: [{ _id: new Types.ObjectId() }] } as never)

        await service().create({ kind: "microfrontend", id: microfrontendId.toString() }, { prompt: "Add a 404 page", effort: "low" })

        expect(start).toHaveBeenCalledWith(expect.objectContaining({ effort: "low" }), expect.anything())
    })

    it("Given a service, when a change is requested on it, then the job runs on the service's repository", async () => {
        vi.spyOn(Service, "findById").mockResolvedValue({
            _id: serviceId,
            projectId,
            slug: "orders-api",
            name: "Orders API",
            port: 8080,
            livenessPath: "/health/live",
            readinessPath: "/health/ready",
            env: []
        } as never)
        const request = { _id: new Types.ObjectId(), jobId: new Types.ObjectId(), serviceId, status: AiChangeStatus.PENDING }
        const start = vi.spyOn(AiChangeJobService.prototype, "start").mockResolvedValue({ job: {}, requests: [request] } as never)

        const created = await service().create({ kind: "service", id: serviceId.toString() }, { prompt: "Add a /ready endpoint" })

        expect(created).toBe(request)
        expect(workspaceService.open).toHaveBeenCalledWith(expect.objectContaining({ kind: "service", slug: "orders-api" }))
        expect(start).toHaveBeenCalledWith(
            expect.objectContaining({ repositories: [{ component: expect.objectContaining({ kind: "service", _id: serviceId }), baseBranch: "main" }] }),
            expect.anything()
        )
    })

    it("Given a service, when its changes are listed, then its latest conversations come back whole", async () => {
        vi.spyOn(Service, "findById").mockResolvedValue({ _id: serviceId, projectId, slug: "orders-api", name: "Orders API", env: [] } as never)
        const conversationIds = [new Types.ObjectId(), new Types.ObjectId()]
        const aggregate = vi.spyOn(AiChangeRequest, "aggregate").mockResolvedValue(conversationIds.map(_id => ({ _id })) as never)
        const find = vi.spyOn(AiChangeRequest, "find").mockReturnValue({ sort: async () => [] } as never)

        await service().list({ kind: "service", id: serviceId.toString() })

        expect(aggregate.mock.calls[0][0]).toEqual(expect.arrayContaining([{ $match: { serviceId } }, { $limit: 20 }]))
        // Every request of those conversations, not only the newest ones: the queue shows each conversation once.
        expect(find).toHaveBeenCalledWith({ serviceId, conversationId: { $in: conversationIds } }, expect.anything())
    })

    it("Given a proposal on a service, when it is applied, then it is pushed on an ai/ branch named after the service", async () => {
        vi.spyOn(Service, "findById").mockResolvedValue({ _id: serviceId, projectId, slug: "orders-api", name: "Orders API", env: [] } as never)
        vi.spyOn(AiChangeRequest, "findById").mockResolvedValue(proposal({ microfrontendId: undefined, serviceId }) as never)
        vi.spyOn(AiChangeRequest, "findOneAndUpdate").mockResolvedValue({ status: AiChangeStatus.APPLYING } as never)

        await service().apply(new Types.ObjectId().toString())

        expect(workspaceService.open).toHaveBeenCalledWith(expect.objectContaining({ kind: "service" }))
        expect(workingCopy.commitAndPush.mock.calls[0][0].branch).toMatch(/^ai\/orders-api-\d{8}-\d{6}$/)
    })

    it("Given a viewer who administers the organization, when a proposal is discarded, then it is allowed", async () => {
        role = RoleInProject.VIEWER
        isAdmin = true
        vi.spyOn(AiChangeRequest, "findById").mockResolvedValue(proposal() as never)
        vi.spyOn(AiChangeRequest, "findOneAndUpdate").mockResolvedValue({ status: AiChangeStatus.DISCARDED } as never)

        await expect(service().discard(new Types.ObjectId().toString())).resolves.toMatchObject({ status: AiChangeStatus.DISCARDED })
    })

    it("Given a proposal already being applied, when it is applied again, then the second one is refused without pushing", async () => {
        vi.spyOn(AiChangeRequest, "findById").mockResolvedValue(proposal() as never)
        vi.spyOn(AiChangeRequest, "findOneAndUpdate").mockResolvedValue(null as never)

        await expect(service().apply(new Types.ObjectId().toString())).rejects.toMatchObject({ statusCode: 409 })
        expect(workingCopy.commitAndPush).not.toHaveBeenCalled()
    })

    it("Given a file changed on the base branch since the proposal, when it is applied, then nothing is pushed and the proposal is kept", async () => {
        vi.spyOn(AiChangeRequest, "findById").mockResolvedValue(proposal() as never)
        vi.spyOn(AiChangeRequest, "findOneAndUpdate").mockResolvedValue({ status: AiChangeStatus.APPLYING } as never)
        workingCopy.blobOid.mockImplementation(async (_commit: string, file: string) => (file === "src/App.tsx" ? "someone-else-blob" : undefined))

        await expect(service().apply(new Types.ObjectId().toString())).rejects.toMatchObject({ code: "AI_CHANGE_CONFLICT", statusCode: 409 })
        expect(workingCopy.commitAndPush).not.toHaveBeenCalled()
        expect(updates.at(-1)).toMatchObject({ status: AiChangeStatus.PROPOSED })
    })

    it("Given an approved proposal, when it is applied, then all its files are committed on an ai/ branch and a pull request is opened", async () => {
        vi.spyOn(AiChangeRequest, "findById").mockResolvedValue(proposal() as never)
        vi.spyOn(AiChangeRequest, "findOneAndUpdate").mockResolvedValue({ status: AiChangeStatus.APPLYING } as never)

        const applied = await service().apply(new Types.ObjectId().toString())

        const pushed = workingCopy.commitAndPush.mock.calls[0][0]
        expect(pushed.branch).toMatch(/^ai\/catalog-\d{8}-\d{6}$/)
        expect(pushed.files).toEqual([
            { path: "src/pages/NotFound.tsx", action: "create", content: "export const NotFound = () => null\n" },
            { path: "src/App.tsx", action: "update", content: "new app\n" }
        ])
        expect(pushed.message).toBe("Add a 404 page\n\nAdded the page")
        expect(pushed.author).toEqual({ name: "Ada", email: "ada@example.com" })
        expect(workspaceService.openPullRequest).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ sourceBranch: pushed.branch, targetBranch: "main", title: "Add a 404 page" }))
        expect(applied).toMatchObject({ status: AiChangeStatus.APPLIED, pullRequestUrl: "https://github.com/acme/catalog/pull/7", commit: "new-commit" })
    })

    it("Given a proposal refined by a follow-up, when it is applied, then the pull request is named after the conversation and the conversation is kept", async () => {
        const parentId = new Types.ObjectId()
        const rootJobId = new Types.ObjectId()
        const jobIds = [rootJobId, new Types.ObjectId()]
        vi.spyOn(AiChangeRequest, "findById")
            .mockResolvedValueOnce(proposal({ prompt: "Also translate it", parentId, jobId: jobIds[1] }) as never)
            .mockResolvedValueOnce({ _id: parentId, prompt: "Add a 404 page" } as never)
        vi.spyOn(AiChangeRequest, "findOneAndUpdate").mockResolvedValue({ status: AiChangeStatus.APPLYING } as never)
        vi.spyOn(AiChangeJob, "findById").mockResolvedValue({ _id: jobIds[1], rootJobId } as never)
        vi.spyOn(AiChangeJob, "find").mockResolvedValue(jobIds.map(_id => ({ _id })) as never)
        const keptJobs = vi.spyOn(AiChangeJob, "updateMany").mockResolvedValue({} as never)
        const keptRequests = vi.spyOn(AiChangeRequest, "updateMany").mockResolvedValue({} as never)

        await service().apply(new Types.ObjectId().toString())

        expect(workspaceService.openPullRequest).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ title: "Add a 404 page", description: expect.stringContaining("> Add a 404 page\n\n> Also translate it") })
        )
        expect(keptJobs).toHaveBeenCalledWith({ _id: { $in: jobIds } }, { $unset: { expiresAt: 1 } })
        expect(keptRequests).toHaveBeenCalledWith({ jobId: { $in: jobIds }, microfrontendId }, { $unset: { expiresAt: 1 } })
    })

    it("Given a follow-up refining the proposal, when it is applied, then it is refused without claiming or pushing", async () => {
        vi.spyOn(AiChangeRequest, "findById").mockResolvedValue(proposal() as never)
        vi.spyOn(AiChangeRequest, "exists").mockResolvedValue({ _id: new Types.ObjectId() } as never)
        const claim = vi.spyOn(AiChangeRequest, "findOneAndUpdate")

        await expect(service().apply(new Types.ObjectId().toString())).rejects.toMatchObject({ code: "AI_JOB_FOLLOW_UP_RUNNING", statusCode: 409 })
        expect(claim).not.toHaveBeenCalled()
        expect(workingCopy.commitAndPush).not.toHaveBeenCalled()
    })

    it("Given the other repositories of its job, when a claimed proposal is applied, then the description names them", async () => {
        const claimed = proposal({ status: AiChangeStatus.APPLYING })
        type WithApplyClaimed = { applyClaimed: (request: unknown, files: unknown, related: string[]) => Promise<unknown> }

        await (service() as unknown as WithApplyClaimed).applyClaimed(claimed, claimed.files, ["Cart: https://github.com/acme/cart/pull/3", "Checkout"])

        expect(workspaceService.openPullRequest).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ description: expect.stringContaining("Part of a change across 3 repositories:\n- Cart: https://github.com/acme/cart/pull/3\n- Checkout") })
        )
    })

    it("Given an apply that crashed after naming its branch, when it is applied again, then the same branch is reused", async () => {
        vi.spyOn(AiChangeRequest, "findById").mockResolvedValue(proposal({ branch: "ai/catalog-20261013-235959" }) as never)
        vi.spyOn(AiChangeRequest, "findOneAndUpdate").mockResolvedValue({ status: AiChangeStatus.APPLYING } as never)

        await service().apply(new Types.ObjectId().toString())

        expect(workingCopy.commitAndPush.mock.calls[0][0].branch).toBe("ai/catalog-20261013-235959")
    })

    it("Given a proposal touching a CI workflow, when it is applied, then it is refused before anything is pushed", async () => {
        vi.spyOn(AiChangeRequest, "findById").mockResolvedValue(proposal({ files: [{ path: ".github/workflows/x.yml", action: "create", proposedContent: "on: push" }] }) as never)

        await expect(service().apply(new Types.ObjectId().toString())).rejects.toMatchObject({ code: "AI_CHANGE_INVALID_FILE" })
        expect(workingCopy.commitAndPush).not.toHaveBeenCalled()
    })

    it("Given a pull request the provider refuses, when it is applied, then the pushed branch is kept and the error is reported", async () => {
        vi.spyOn(AiChangeRequest, "findById").mockResolvedValue(proposal() as never)
        vi.spyOn(AiChangeRequest, "findOneAndUpdate").mockResolvedValue({ status: AiChangeStatus.APPLYING } as never)
        workspaceService.openPullRequest.mockRejectedValueOnce(new Error("Resource not accessible by integration"))

        const applied = await service().apply(new Types.ObjectId().toString())

        expect(applied).toMatchObject({ status: AiChangeStatus.APPLIED, pullRequestError: "Resource not accessible by integration" })
        expect(applied.pullRequestUrl).toBeUndefined()
    })
})
