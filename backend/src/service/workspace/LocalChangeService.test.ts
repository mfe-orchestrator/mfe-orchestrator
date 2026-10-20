import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import CodeRepository, { CodeRepositoryProvider } from "../../models/CodeRepositoryModel"
import Microfrontend from "../../models/MicrofrontendModel"
import Service from "../../models/ServiceModel"
import { LocalChangeService } from "./LocalChangeService"

const HEAD = "a".repeat(40)
const OLD = "b".repeat(40)
const PROJECT = "cccccccccccccccccccccccc"
const MICROFRONTEND = "dddddddddddddddddddddddd"

const { workingCopy, prepare, openPullRequest, ensureCanChangeProject, findComponent } = vi.hoisted(() => ({
    workingCopy: { dir: "/repos/cart", hasCommit: vi.fn(), blobOid: vi.fn(), commitAndPush: vi.fn() },
    prepare: vi.fn(),
    openPullRequest: vi.fn(),
    ensureCanChangeProject: vi.fn(),
    findComponent: vi.fn()
}))

vi.mock("../..", () => ({ fastify: { config: {}, log: { warn: vi.fn() } } }))
vi.mock("../../utils/repositoryLock", () => ({ withRepositoryLock: (_name: string, task: () => unknown) => task() }))
vi.mock("./repositoryComponent", () => ({ findComponent }))
vi.mock("../aiChange/AiChangeService", () => ({
    default: class {
        ensureCanChangeProject = ensureCanChangeProject
    }
}))
vi.mock("../ProjectService", () => ({
    default: class {
        getContext = vi.fn().mockResolvedValue({ project: { id: PROJECT } })
    }
}))
vi.mock("./RepositoryWorkspaceService", () => ({
    cloneUrlFor: () => "https://github.com/acme/cart-fe.git",
    default: class {
        open = vi.fn().mockResolvedValue({ workingCopy, target: { repositoryName: "cart-fe" }, defaultBranch: "main" })
        prepare = prepare
        openPullRequest = openPullRequest
    }
}))

const user = { _id: "user-1", email: "dev@example.com", name: "Ada", surname: "Lovelace", restrictedToProjectIds: [PROJECT] }
// The project membership is the authorization layer's: every call is allowed here.
const allowProjectAccess = (instance: LocalChangeService) => {
    vi.spyOn(instance as unknown as { ensureAccessToProject: () => Promise<void> }, "ensureAccessToProject").mockResolvedValue()
    vi.spyOn(instance as unknown as { getDomainScope: () => Promise<string[] | undefined> }, "getDomainScope").mockResolvedValue(undefined)
    return instance
}
const service = () => allowProjectAccess(new LocalChangeService(user as never))
const ref = { kind: "microfrontend" as const, id: MICROFRONTEND }
const input = (overrides: Record<string, unknown> = {}) => ({
    baseCommit: HEAD,
    title: "Add a footer",
    description: "Shows the legal links",
    files: [{ path: "src/Footer.tsx", action: "update" as const, content: "export const Footer = () => null" }],
    ...overrides
})

beforeEach(() => {
    vi.clearAllMocks()
    findComponent.mockResolvedValue({ kind: "microfrontend", _id: MICROFRONTEND, projectId: PROJECT, slug: "cart", name: "Cart" })
    prepare.mockResolvedValue(HEAD)
    workingCopy.blobOid.mockResolvedValue("blob-1")
    workingCopy.commitAndPush.mockResolvedValue("commit-1")
    openPullRequest.mockResolvedValue("https://github.com/acme/cart-fe/pull/7")
})

describe("LocalChangeService.checkout", () => {
    it("returns the clone URL without credentials, the default branch and the AI context", async () => {
        await expect(service().checkout(ref)).resolves.toEqual({
            kind: "microfrontend",
            name: "Cart",
            slug: "cart",
            cloneUrl: "https://github.com/acme/cart-fe.git",
            defaultBranch: "main",
            aiContext: { project: { id: PROJECT } }
        })
    })
})

describe("LocalChangeService.submit", () => {
    it("pushes a new branch from the latest base and opens a pull request", async () => {
        const result = await service().submit(ref, input())

        expect(ensureCanChangeProject).toHaveBeenCalledWith(PROJECT)
        expect(prepare).toHaveBeenCalledWith(expect.anything(), "main")
        const pushed = workingCopy.commitAndPush.mock.calls[0][0]
        expect(pushed.branch).toMatch(/^mcp\/cart-\d{8}-\d{6}$/)
        expect(pushed.author).toEqual({ name: "Ada Lovelace", email: "dev@example.com" })
        expect(pushed.message).toBe("Add a footer\n\nShows the legal links")
        expect(pushed.files).toEqual([{ path: "src/Footer.tsx", action: "update", content: "export const Footer = () => null" }])
        expect(openPullRequest.mock.calls[0][1]).toMatchObject({ sourceBranch: pushed.branch, targetBranch: "main", title: "Add a footer" })
        expect(result).toEqual({
            branch: pushed.branch,
            commit: "commit-1",
            baseBranch: "main",
            baseCommit: HEAD,
            pullRequestUrl: "https://github.com/acme/cart-fe/pull/7",
            pullRequestError: undefined
        })
    })

    it("keeps the pushed branch when the pull request cannot be opened", async () => {
        openPullRequest.mockRejectedValue(new Error("rate limited"))
        await expect(service().submit(ref, input())).resolves.toMatchObject({ commit: "commit-1", pullRequestUrl: undefined, pullRequestError: "rate limited" })
    })

    it("refuses when the base moved and the clone's commit cannot be checked", async () => {
        workingCopy.hasCommit.mockResolvedValue(false)
        await expect(service().submit(ref, input({ baseCommit: OLD }))).rejects.toMatchObject({ code: "LOCAL_CHANGE_BASE_MOVED", statusCode: 409 })
        expect(workingCopy.commitAndPush).not.toHaveBeenCalled()
    })

    it("refuses a file that changed on the base after the clone", async () => {
        workingCopy.hasCommit.mockResolvedValue(true)
        workingCopy.blobOid.mockImplementation(async (commit: string) => (commit === OLD ? "blob-old" : "blob-new"))
        await expect(service().submit(ref, input({ baseCommit: OLD }))).rejects.toMatchObject({ code: "LOCAL_CHANGE_CONFLICT", details: { conflicts: ["src/Footer.tsx"], head: HEAD } })
        expect(workingCopy.commitAndPush).not.toHaveBeenCalled()
    })

    it("accepts a moved base when none of the files changed there", async () => {
        workingCopy.hasCommit.mockResolvedValue(true)
        await expect(service().submit(ref, input({ baseCommit: OLD }))).resolves.toMatchObject({ baseCommit: HEAD })
    })

    it.each([
        [".github/workflows/ci.yml", "CI runs it"],
        ["pnpm-lock.yaml", "CI runs it"],
        ["../other/secret.ts", "outside the repository"],
        [".git/config", "inside .git"]
    ])("refuses %s", async (path, message) => {
        await expect(service().submit(ref, input({ files: [{ path, action: "update", content: "x" }] }))).rejects.toThrow(message)
        expect(prepare).not.toHaveBeenCalled()
    })

    it("refuses a file listed twice, a missing content and a binary file", async () => {
        const twice = [
            { path: "src/a.ts", action: "update", content: "1" },
            { path: "./src/a.ts", action: "update", content: "2" }
        ]
        await expect(service().submit(ref, input({ files: twice }))).rejects.toThrow("listed twice")
        await expect(service().submit(ref, input({ files: [{ path: "src/a.ts", action: "create" }] }))).rejects.toThrow("has no content")
        await expect(service().submit(ref, input({ files: [{ path: "logo.png", action: "create", content: "PNG\0" }] }))).rejects.toThrow("binary")
    })

    it("refuses an action that does not match the base", async () => {
        await expect(service().submit(ref, input({ files: [{ path: "src/Footer.tsx", action: "create", content: "x" }] }))).rejects.toThrow("already exists")
        workingCopy.blobOid.mockResolvedValue(undefined)
        await expect(service().submit(ref, input({ files: [{ path: "src/Footer.tsx", action: "delete" }] }))).rejects.toThrow("does not exist")
    })

    it("signs as the orchestrator for an API key", async () => {
        const instance = allowProjectAccess(new LocalChangeService({ _id: "key-1", email: "api-key:key-1", apiKeyId: "key-1", restrictedToProjectIds: [PROJECT] } as never))
        await instance.submit(ref, input())
        expect(workingCopy.commitAndPush.mock.calls[0][0].author).toEqual({ name: "MFE Orchestrator", email: "noreply@mfe-orchestrator.dev" })
        expect(openPullRequest.mock.calls[0][1].description).toContain("the API key key-1")
    })
})

describe("LocalChangeService by a member assigned to some domains", () => {
    const OWN_DOMAIN = "eeeeeeeeeeeeeeeeeeeeeeee"
    const scoped = () => {
        const instance = allowProjectAccess(new LocalChangeService(user as never))
        vi.spyOn(instance as unknown as { getDomainScope: () => Promise<string[] | undefined> }, "getDomainScope").mockResolvedValue([OWN_DOMAIN])
        return instance
    }

    beforeEach(() => {
        findComponent.mockResolvedValue({
            kind: "microfrontend",
            _id: MICROFRONTEND,
            projectId: PROJECT,
            slug: "cart",
            name: "Cart",
            domainId: OWN_DOMAIN,
            codeRepository: { enabled: true, codeRepositoryId: "ffffffffffffffffffffffff", name: "shop-fe" }
        })
        vi.spyOn(CodeRepository, "findById").mockResolvedValue({ provider: CodeRepositoryProvider.GITHUB } as never)
        // The repository is also the code of a service outside their domains
        vi.spyOn(Microfrontend, "exists").mockResolvedValue(null as never)
        vi.spyOn(Service, "exists").mockResolvedValue({ _id: "service-elsewhere" } as never)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it("refuses to submit to a repository shared with another domain, before anything is pushed", async () => {
        await expect(scoped().submit(ref, input())).rejects.toMatchObject({ code: "DOMAIN_SCOPE_FORBIDDEN", statusCode: 403 })
        expect(prepare).not.toHaveBeenCalled()
        expect(workingCopy.commitAndPush).not.toHaveBeenCalled()
    })

    it("still hands out the checkout of that repository: reading it writes nothing", async () => {
        await expect(scoped().checkout(ref)).resolves.toMatchObject({ slug: "cart" })
    })
})
