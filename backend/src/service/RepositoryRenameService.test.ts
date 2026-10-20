import { AxiosError, AxiosHeaders } from "axios"
import { Types } from "mongoose"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("..", () => ({
    fastify: { log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }, config: {} }
}))

const githubRename = vi.fn()
vi.mock("../client/GithubClient", () => ({
    default: class {
        renameRepository = githubRename
    }
}))

const gitlabGet = vi.fn()
const gitlabRename = vi.fn()
const gitlabUrls: string[] = []
vi.mock("../client/GitlabClient", () => ({
    default: class {
        constructor(url: string) {
            gitlabUrls.push(url)
        }
        getProject = gitlabGet
        renameProject = gitlabRename
    }
}))

const azureGet = vi.fn()
const azureRename = vi.fn()
vi.mock("../client/AzureDevOpsClient", () => ({
    default: class {
        getRepository = azureGet
        renameRepository = azureRename
    }
}))

const findCodeRepository = vi.fn()
vi.mock("./CodeRepositoryService", () => ({
    default: class {
        findById = findCodeRepository
    }
}))

import { BusinessException } from "../errors/BusinessException"
import { CodeRepositoryProvider } from "../models/CodeRepositoryModel"
import Microfrontend from "../models/MicrofrontendModel"
import Project from "../models/ProjectModel"
import Service from "../models/ServiceModel"
import UserProject, { RoleInProject } from "../models/UserProjectModel"
import BaseAuthorizedService from "./BaseAuthorizedService"
import { isValidRepositoryName, RepositoryRenameService } from "./RepositoryRenameService"

const projectId = new Types.ObjectId()
const codeRepositoryId = new Types.ObjectId()

type Spied = { ensureAccessToProject: () => Promise<void>; getUser: () => unknown; isOrganizationAdmin: () => Promise<boolean> }
const base = BaseAuthorizedService.prototype as unknown as Spied

const microfrontend = (codeRepository: Record<string, unknown>) =>
    new Microfrontend({
        projectId,
        name: "Checkout",
        slug: "checkout",
        version: "1.0.0",
        host: { type: "MFE_ORCHESTRATOR_HUB" },
        codeRepository: { enabled: true, codeRepositoryId, ...codeRepository }
    })

const connection = (provider: CodeRepositoryProvider, data: Record<string, unknown>) => ({ _id: codeRepositoryId, projectId, provider, accessToken: "token", ...data })

const providerError = (status: number, data: unknown) => {
    const error = new AxiosError("Request failed", String(status))
    error.response = { status, data, statusText: "", headers: {}, config: { headers: new AxiosHeaders() } }
    return error
}

let updateMicrofrontends: ReturnType<typeof vi.fn>
let updateServices: ReturnType<typeof vi.fn>

/** Renames with the microfrontend given; the writes are answered by the spies above. */
const rename = (document: ReturnType<typeof microfrontend>, name: unknown) => {
    vi.spyOn(Microfrontend, "findById").mockResolvedValue(document as never)
    return new RepositoryRenameService().renameMicrofrontendRepository(document._id.toString(), name)
}

/** The `$set` written to the links of the renamed repository. */
const written = () => updateMicrofrontends.mock.calls[0][1].$set

const errorOf = async (promise: Promise<unknown>) => {
    try {
        await promise
    } catch (error) {
        return error as BusinessException
    }
    throw new Error("expected a rejection")
}

beforeEach(() => {
    vi.spyOn(base, "ensureAccessToProject").mockResolvedValue()
    vi.spyOn(base, "getUser").mockReturnValue({ _id: new Types.ObjectId() })
    vi.spyOn(UserProject, "findOne").mockResolvedValue({ role: RoleInProject.MEMBER } as never)
    updateMicrofrontends = vi.spyOn(Microfrontend, "updateMany").mockResolvedValue({} as never) as unknown as ReturnType<typeof vi.fn>
    updateServices = vi.spyOn(Service, "updateMany").mockResolvedValue({} as never) as unknown as ReturnType<typeof vi.fn>
})

afterEach(() => {
    vi.restoreAllMocks()
    for (const mock of [githubRename, gitlabGet, gitlabRename, azureGet, azureRename, findCodeRepository]) mock.mockReset()
    gitlabUrls.length = 0
})

describe("isValidRepositoryName", () => {
    it("given names every provider accepts, when checked, then they are valid", () => {
        for (const name of ["checkout", "checkout-web", "Checkout_Web.v2", "a", "web_"]) {
            expect(isValidRepositoryName(name), name).toBe(true)
        }
    })

    it("given names one of the providers refuses, when checked, then they are refused", () => {
        for (const name of ["", "checkout web", "team/checkout", ".hidden", "-web", "_web", "web.", "checkout.git", "checkout.GIT", "feed.atom", "a".repeat(101)]) {
            expect(isValidRepositoryName(name), name).toBe(false)
        }
    })
})

describe("RepositoryRenameService.renameMicrofrontendRepository", () => {
    it("given a GitHub repository, when renamed, then the provider is asked by the current name and the new name, id and clone URLs are stored", async () => {
        findCodeRepository.mockResolvedValue(connection(CodeRepositoryProvider.GITHUB, { githubData: { organizationId: "acme" } }))
        githubRename.mockResolvedValue({
            id: 42,
            name: "checkout-web",
            clone_url: "https://github.com/acme/checkout-web.git",
            ssh_url: "git@github.com:acme/checkout-web.git"
        })
        const document = microfrontend({ name: "checkout", repositoryId: "checkout", repositoryData: { clone_url: "https://github.com/acme/checkout.git" } })

        await rename(document, "  checkout-web ")

        expect(githubRename).toHaveBeenCalledWith({ accessToken: "token", orgName: "acme", userName: undefined, repositoryName: "checkout", newName: "checkout-web" })
        // Only the link changes: the microfrontend keeps its own name and slug
        expect(written()).toEqual({
            "codeRepository.name": "checkout-web",
            "codeRepository.repositoryId": "42",
            "codeRepository.repositoryData": {},
            "codeRepository.cloneUrlHttps": "https://github.com/acme/checkout-web.git",
            "codeRepository.cloneUrlSsh": "git@github.com:acme/checkout-web.git"
        })
    })

    it("given other microfrontends and services linked to the same repository, when renamed, then their links follow too", async () => {
        findCodeRepository.mockResolvedValue(connection(CodeRepositoryProvider.GITHUB, { githubData: { userName: "jane" } }))
        githubRename.mockResolvedValue({ id: 42, name: "checkout-web" })
        const document = microfrontend({ name: "checkout", repositoryId: "42" })

        await rename(document, "checkout-web")

        const sameRepository = [{ "codeRepository.repositoryId": "42" }, { "codeRepository.name": "checkout" }]
        expect(updateMicrofrontends.mock.calls[0][0]).toEqual({ projectId, "codeRepository.codeRepositoryId": codeRepositoryId, $or: [{ _id: document._id }, ...sameRepository] })
        expect(updateServices.mock.calls[0][0]).toEqual({ projectId, "codeRepository.codeRepositoryId": codeRepositoryId, $or: sameRepository })
    })

    it("given a GitLab project, when renamed, then it is checked by its id and its path moves with the name", async () => {
        findCodeRepository.mockResolvedValue(connection(CodeRepositoryProvider.GITLAB, { gitlabData: { url: "https://gitlab.acme.dev", groupId: 7, groupPath: "web" } }))
        gitlabGet.mockResolvedValue({ id: 99, name: "checkout" })
        gitlabRename.mockResolvedValue({
            id: 99,
            name: "checkout-web",
            path_with_namespace: "web/checkout-web",
            http_url_to_repo: "https://gitlab.acme.dev/web/checkout-web.git",
            ssh_url_to_repo: "git@gitlab.acme.dev:web/checkout-web.git"
        })
        const document = microfrontend({ name: "checkout", repositoryId: "99", gitlab: { groupId: 7, path: "web/checkout" } })

        await rename(document, "checkout-web")

        expect(gitlabUrls).toEqual(["https://gitlab.acme.dev"])
        expect(gitlabGet).toHaveBeenCalledWith("99")
        expect(gitlabRename).toHaveBeenCalledWith(99, "checkout-web")
        expect(written()).toMatchObject({ "codeRepository.repositoryId": "99", "codeRepository.gitlab.path": "web/checkout-web" })
        // Two groups can hold a repository of the same name: on GitLab the path tells them apart
        expect(updateServices.mock.calls[0][0].$or).toEqual([{ "codeRepository.repositoryId": "99" }, { "codeRepository.gitlab.path": "web/checkout" }])
    })

    it("given a GitLab link with a name only, when renamed, then the project is found by its full path", async () => {
        findCodeRepository.mockResolvedValue(connection(CodeRepositoryProvider.GITLAB, { gitlabData: { url: "https://gitlab.com", groupPath: "acme/web" } }))
        gitlabGet.mockResolvedValue({ id: 5, name: "checkout" })
        gitlabRename.mockResolvedValue({ id: 5, name: "checkout-web" })

        await rename(microfrontend({ name: "checkout" }), "checkout-web")

        expect(gitlabGet).toHaveBeenCalledWith(encodeURIComponent("acme/web/checkout"))
    })

    it("given an Azure DevOps repository linked by name, when renamed, then its id is looked up first and stored from then on", async () => {
        findCodeRepository.mockResolvedValue(connection(CodeRepositoryProvider.AZURE_DEV_OPS, { azureData: { organization: "acme", projectId: "p-1", projectName: "Web" } }))
        azureGet.mockResolvedValue({ id: "guid-1", name: "checkout" })
        azureRename.mockResolvedValue({ id: "guid-1", name: "checkout-web", remoteUrl: "https://dev.azure.com/acme/Web/_git/checkout-web" })

        await rename(microfrontend({ name: "checkout", repositoryId: "checkout" }), "checkout-web")

        expect(azureGet).toHaveBeenCalledWith("token", "acme", "p-1", "checkout")
        expect(azureRename).toHaveBeenCalledWith("token", "acme", "p-1", "guid-1", "checkout-web")
        expect(written()).toMatchObject({ "codeRepository.repositoryId": "guid-1", "codeRepository.cloneUrlHttps": "https://dev.azure.com/acme/Web/_git/checkout-web" })
    })

    it("given a link whose id points to another repository than the name shown, when renamed, then nothing is renamed", async () => {
        findCodeRepository.mockResolvedValue(connection(CodeRepositoryProvider.AZURE_DEV_OPS, { azureData: { organization: "acme", projectId: "p-1", projectName: "Web" } }))
        azureGet.mockResolvedValue({ id: "guid-a", name: "orders" })

        const error = await errorOf(rename(microfrontend({ name: "checkout", repositoryId: "guid-a" }), "checkout-web"))

        expect(error).toMatchObject({ code: "REPOSITORY_LINK_INCONSISTENT", statusCode: 409 })
        expect(azureRename).not.toHaveBeenCalled()
        expect(updateMicrofrontends).not.toHaveBeenCalled()
    })

    it("given the name it already has, when renamed, then neither the provider nor the database is touched", async () => {
        findCodeRepository.mockResolvedValue(connection(CodeRepositoryProvider.GITHUB, { githubData: { userName: "jane" } }))

        await rename(microfrontend({ name: "checkout", repositoryId: "42" }), "checkout")

        expect(githubRename).not.toHaveBeenCalled()
        expect(updateMicrofrontends).not.toHaveBeenCalled()
    })

    it("given an invalid or missing name, when renamed, then it is refused before anything is read", async () => {
        const find = vi.spyOn(Microfrontend, "findById")

        for (const name of ["team/checkout", 123, undefined]) {
            const error = await errorOf(new RepositoryRenameService().renameMicrofrontendRepository(new Types.ObjectId().toString(), name))
            expect(error, String(name)).toMatchObject({ code: "INVALID_REPOSITORY_NAME", statusCode: 400 })
        }
        expect(find).not.toHaveBeenCalled()
    })

    it("given a VIEWER of the project, when renamed, then it is forbidden before the provider is reached", async () => {
        vi.spyOn(UserProject, "findOne").mockResolvedValue({ role: RoleInProject.VIEWER } as never)
        vi.spyOn(Project, "findById").mockResolvedValue({ organizationId: new Types.ObjectId() } as never)
        vi.spyOn(base, "isOrganizationAdmin").mockResolvedValue(false)

        const error = await errorOf(rename(microfrontend({ name: "checkout" }), "checkout-web"))

        expect(error).toMatchObject({ code: "REPOSITORY_RENAME_FORBIDDEN", statusCode: 403 })
        expect(findCodeRepository).not.toHaveBeenCalled()
    })

    it("given a VIEWER who administers the organization, when renamed, then it goes through", async () => {
        vi.spyOn(UserProject, "findOne").mockResolvedValue({ role: RoleInProject.VIEWER } as never)
        vi.spyOn(Project, "findById").mockResolvedValue({ organizationId: new Types.ObjectId() } as never)
        vi.spyOn(base, "isOrganizationAdmin").mockResolvedValue(true)
        findCodeRepository.mockResolvedValue(connection(CodeRepositoryProvider.GITHUB, { githubData: { userName: "jane" } }))
        githubRename.mockResolvedValue({ id: 42, name: "checkout-web" })

        await rename(microfrontend({ name: "checkout" }), "checkout-web")

        expect(githubRename).toHaveBeenCalledTimes(1)
    })

    it("given a microfrontend without a linked repository, when renamed, then it is refused", async () => {
        const error = await errorOf(rename(microfrontend({ enabled: false }), "checkout-web"))

        expect(error).toMatchObject({ code: "REPOSITORY_NOT_LINKED", statusCode: 422 })
        expect(findCodeRepository).not.toHaveBeenCalled()
    })

    it("given a connection of another project, when renamed, then the connection is not found and the provider is not called", async () => {
        findCodeRepository.mockResolvedValue({ ...connection(CodeRepositoryProvider.GITHUB, {}), projectId: new Types.ObjectId() })

        await expect(rename(microfrontend({ name: "checkout" }), "checkout-web")).rejects.toThrow()
        expect(githubRename).not.toHaveBeenCalled()
    })

    it("given a name already taken at the provider, when renamed, then it is a conflict and nothing is saved", async () => {
        findCodeRepository.mockResolvedValue(connection(CodeRepositoryProvider.GITHUB, { githubData: { userName: "jane" } }))
        githubRename.mockRejectedValue(providerError(422, { message: "Repository creation failed.", errors: [{ message: "name already exists on this account" }] }))

        const error = await errorOf(rename(microfrontend({ name: "checkout" }), "checkout-web"))

        expect(error).toMatchObject({ code: "REPOSITORY_NAME_TAKEN", statusCode: 409 })
        expect(updateMicrofrontends).not.toHaveBeenCalled()
    })

    it("given a GitLab answer that the path is taken, when renamed, then it is a conflict too", async () => {
        findCodeRepository.mockResolvedValue(connection(CodeRepositoryProvider.GITLAB, { gitlabData: { url: "https://gitlab.com" } }))
        gitlabGet.mockResolvedValue({ id: 1, name: "checkout" })
        gitlabRename.mockRejectedValue(providerError(400, { message: { path: ["has already been taken"] } }))

        expect(await errorOf(rename(microfrontend({ name: "checkout", repositoryId: "1" }), "checkout-web"))).toMatchObject({ code: "REPOSITORY_NAME_TAKEN" })
    })

    it("given a provider that refuses for another reason, when renamed, then its reason is passed on readable", async () => {
        findCodeRepository.mockResolvedValue(connection(CodeRepositoryProvider.GITLAB, { gitlabData: { url: "https://gitlab.com" } }))
        gitlabGet.mockResolvedValue({ id: 1, name: "checkout" })
        gitlabRename.mockRejectedValue(providerError(400, { message: { path: ["must not start with a special character", "cannot end with .atom"] } }))

        expect(await errorOf(rename(microfrontend({ name: "checkout", repositoryId: "1" }), "checkout-web"))).toMatchObject({
            code: "REPOSITORY_RENAME_FAILED",
            statusCode: 422,
            message: "path must not start with a special character, cannot end with .atom"
        })
    })

    it("given a rename the database fails to record, when renamed, then the error names the new name so the link can be fixed", async () => {
        findCodeRepository.mockResolvedValue(connection(CodeRepositoryProvider.GITHUB, { githubData: { userName: "jane" } }))
        githubRename.mockResolvedValue({ id: 42, name: "checkout-web" })
        updateMicrofrontends.mockRejectedValue(new Error("connection lost"))

        const error = await errorOf(rename(microfrontend({ name: "checkout" }), "checkout-web"))

        expect(error).toMatchObject({ code: "REPOSITORY_RENAMED_NOT_RECORDED", statusCode: 500 })
        expect(error.message).toContain('"checkout-web"')
    })

    describe("by a member assigned to some domains", () => {
        const ownDomain = new Types.ObjectId()
        const scopedDocument = () => {
            const document = microfrontend({ name: "checkout", repositoryId: "42" })
            document.domainId = ownDomain as never
            return document
        }
        /** As `rename`, by a principal: the domain scope is read from their membership. */
        const scopedRename = (document: ReturnType<typeof microfrontend>, name: string) => {
            vi.spyOn(Microfrontend, "findById").mockResolvedValue(document as never)
            return new RepositoryRenameService({ _id: new Types.ObjectId() } as never).renameMicrofrontendRepository(document._id.toString(), name)
        }

        beforeEach(() => {
            vi.spyOn(UserProject, "findOne").mockResolvedValue({ role: RoleInProject.MEMBER, domainScoped: true, domainIds: [ownDomain] } as never)
            vi.spyOn(Project, "findOne").mockResolvedValue(null as never)
            findCodeRepository.mockResolvedValue(connection(CodeRepositoryProvider.GITHUB, { githubData: { userName: "jane" } }))
            githubRename.mockResolvedValue({ id: 42, name: "checkout-web" })
        })

        it.each([
            ["a microfrontend", "microfrontend"],
            ["a service", "service"]
        ])("given %s of another domain or of none linked to the same repository, when renamed, then it is refused before the provider is reached", async (_case, outside) => {
            const microfrontendsOutside = vi.spyOn(Microfrontend, "exists").mockResolvedValue((outside === "microfrontend" ? { _id: new Types.ObjectId() } : null) as never)
            vi.spyOn(Service, "exists").mockResolvedValue((outside === "service" ? { _id: new Types.ObjectId() } : null) as never)
            const document = scopedDocument()

            await expect(scopedRename(document, "checkout-web")).rejects.toMatchObject({ code: "DOMAIN_SCOPE_FORBIDDEN", statusCode: 403 })
            expect(githubRename).not.toHaveBeenCalled()
            expect(updateMicrofrontends).not.toHaveBeenCalled()
            // The same links the rename writes to, outside the scope: $nin also takes those of no domain
            expect(microfrontendsOutside).toHaveBeenCalledWith({
                projectId,
                "codeRepository.codeRepositoryId": codeRepositoryId,
                $or: [{ _id: document._id }, { "codeRepository.repositoryId": "42" }, { "codeRepository.name": "checkout" }],
                domainId: { $nin: [String(ownDomain)] }
            })
        })

        it("given every link to the repository in their domains, when renamed, then it goes through", async () => {
            vi.spyOn(Microfrontend, "exists").mockResolvedValue(null as never)
            vi.spyOn(Service, "exists").mockResolvedValue(null as never)

            await scopedRename(scopedDocument(), "checkout-web")

            expect(githubRename).toHaveBeenCalledTimes(1)
            expect(updateMicrofrontends).toHaveBeenCalledTimes(1)
        })
    })
})
