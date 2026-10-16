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

import AiChangeRequest, { AiChangeStatus } from "../../models/AiChangeRequestModel"
import Microfrontend from "../../models/MicrofrontendModel"
import Project from "../../models/ProjectModel"
import { IUser } from "../../models/UserModel"
import UserProject, { RoleInProject } from "../../models/UserProjectModel"
import AiChangeJobService from "./AiChangeJobService"
import AiChangeService from "./AiChangeService"

type WithGates = { ensureAccessToProject: () => Promise<void>; ensureAccessToMicrofrontend: () => Promise<void>; isOrganizationAdmin: () => Promise<boolean> }

const user = { _id: new Types.ObjectId(), email: "ada@example.com", name: "Ada" } as unknown as IUser
const projectId = new Types.ObjectId()
const microfrontendId = new Types.ObjectId()

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

        await expect(service().create(microfrontendId.toString(), { prompt: "Add a 404 page" })).rejects.toMatchObject({ statusCode: 403 })
        expect(create).not.toHaveBeenCalled()
    })

    it("Given a member, when a change is requested, then it runs as a job on that repository alone and its request comes back", async () => {
        const request = { _id: new Types.ObjectId(), jobId: new Types.ObjectId(), status: AiChangeStatus.PENDING }
        const start = vi.spyOn(AiChangeJobService.prototype, "start").mockResolvedValue({ job: {}, requests: [request] } as never)

        const created = await service().create(microfrontendId.toString(), { prompt: "Add a 404 page", baseBranch: " develop " })

        expect(created).toBe(request)
        expect(start).toHaveBeenCalledWith(
            { projectId, prompt: "Add a 404 page", scope: "selection", repositories: [{ microfrontend: expect.objectContaining({ slug: "catalog" }), baseBranch: "develop" }] },
            expect.anything()
        )
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
