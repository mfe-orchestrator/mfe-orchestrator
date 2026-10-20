import { Types } from "mongoose"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("..", () => ({
    fastify: { log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }, config: {} }
}))

/** Every GitLab client built, with the URL and the token it would send there. */
const gitlabClients: { url: string; token: string }[] = []
vi.mock("../client/GitlabClient", () => ({
    default: class {
        constructor(url: string, token: string) {
            gitlabClients.push({ url, token })
        }
        getGroups = vi.fn().mockResolvedValue([])
    }
}))

const azureGetProjects = vi.fn()
vi.mock("../client/AzureDevOpsClient", () => ({
    default: class {
        getProjects = azureGetProjects
        getVariableGroups = vi.fn()
    }
}))

import CodeRepository, { CodeRepositoryProvider } from "../models/CodeRepositoryModel"
import { IUser } from "../models/UserModel"
import BaseAuthorizedService, { domainScopeForbidden } from "./BaseAuthorizedService"
import CodeRepositoryService from "./CodeRepositoryService"

type Guards = { ensureAccessToProject: () => Promise<void>; ensureWholeProject: () => Promise<void> }
const guards = BaseAuthorizedService.prototype as unknown as Guards

const STORED_TOKEN = "glpat-stored"
const connectionId = String(new Types.ObjectId())

const connection = (fields: Record<string, unknown>) => ({ _id: connectionId, projectId: new Types.ObjectId(), accessToken: STORED_TOKEN, save: vi.fn(), ...fields })
const gitlabConnection = () => connection({ provider: CodeRepositoryProvider.GITLAB, gitlabData: { url: "https://gitlab.acme.dev", groupId: 7, groupPath: "acme" } })

const service = () => new CodeRepositoryService({ _id: new Types.ObjectId() } as unknown as IUser)
const storedTokenRequired = { code: "ACCESS_TOKEN_REQUIRED", statusCode: 400 }

let stored: ReturnType<typeof connection>

beforeEach(() => {
    gitlabClients.length = 0
    azureGetProjects.mockReset().mockResolvedValue({ value: [] })
    stored = gitlabConnection()
    vi.spyOn(CodeRepository, "findOne").mockImplementation((() => Promise.resolve(stored)) as never)
    vi.spyOn(guards, "ensureAccessToProject").mockResolvedValue()
    vi.spyOn(guards, "ensureWholeProject").mockResolvedValue()
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe("connection test with the stored token", () => {
    it("Given a GitLab connection, when a test names another host without a token, then it is refused and the token goes nowhere", async () => {
        await expect(service().testConnectionGitlab("https://attacker.example", "", connectionId)).rejects.toMatchObject(storedTokenRequired)
        expect(gitlabClients).toEqual([])
    })

    it("Given a GitLab connection, when a test names its own URL, then the stored token is used there", async () => {
        await service().testConnectionGitlab("https://gitlab.acme.dev/", "", connectionId)

        expect(gitlabClients).toEqual([{ url: "https://gitlab.acme.dev/", token: STORED_TOKEN }])
    })

    it("Given a GitHub connection, when a GitLab test takes its stored token, then it is refused and the token goes nowhere", async () => {
        stored = connection({ provider: CodeRepositoryProvider.GITHUB })

        await expect(service().testConnectionGitlab("https://gitlab.acme.dev", "", connectionId)).rejects.toMatchObject(storedTokenRequired)
        expect(gitlabClients).toEqual([])
    })

    it("Given a member who does not manage the connections, when a test takes the stored token, then it is refused and the token goes nowhere", async () => {
        vi.mocked(guards.ensureWholeProject).mockRejectedValue(domainScopeForbidden())

        await expect(service().testConnectionGitlab("https://gitlab.acme.dev", "", connectionId)).rejects.toMatchObject({ code: "DOMAIN_SCOPE_FORBIDDEN" })
        await expect(service().testConnectionAzure("acme", "", connectionId)).rejects.toMatchObject({ code: "DOMAIN_SCOPE_FORBIDDEN" })
        expect(gitlabClients).toEqual([])
        expect(azureGetProjects).not.toHaveBeenCalled()
    })

    it("Given a token typed in, when a test names any host, then that token is used and no connection is read", async () => {
        await service().testConnectionGitlab("https://gitlab.other.dev", "glpat-typed", connectionId)

        expect(gitlabClients).toEqual([{ url: "https://gitlab.other.dev", token: "glpat-typed" }])
        expect(CodeRepository.findOne).not.toHaveBeenCalled()
    })

    it("Given an Azure DevOps connection, when a test takes its stored token, then it is used against Azure DevOps", async () => {
        stored = connection({ provider: CodeRepositoryProvider.AZURE_DEV_OPS, azureData: { organization: "acme" } })

        await service().testConnectionAzure("acme", "", connectionId)

        expect(azureGetProjects).toHaveBeenCalledWith(STORED_TOKEN, "acme")
    })

    it("Given a GitLab connection, when an Azure DevOps test takes its stored token, then it is refused", async () => {
        await expect(service().testConnectionAzure("acme", "", connectionId)).rejects.toMatchObject(storedTokenRequired)
        expect(azureGetProjects).not.toHaveBeenCalled()
    })
})

describe("GitLab connection edited with the stored token", () => {
    beforeEach(() => {
        vi.spyOn(CodeRepositoryService.prototype, "injectSecretsToDeployOnGitlabRaw").mockResolvedValue(undefined as never)
    })

    it("Given a GitLab connection, when it is saved with another URL and the token not typed again, then it is refused and nothing is written", async () => {
        const saved = service().editRepositoryGitlabRaw({ name: "acme", url: "https://attacker.example", pat: "", groupId: 7, groupPath: "acme" } as never, connectionId)

        await expect(saved).rejects.toMatchObject(storedTokenRequired)
        expect(stored.save).not.toHaveBeenCalled()
        expect(CodeRepositoryService.prototype.injectSecretsToDeployOnGitlabRaw).not.toHaveBeenCalled()
    })

    it("Given a GitLab connection, when it is saved with another URL and a new token, then it is written", async () => {
        await service().editRepositoryGitlabRaw({ name: "acme", url: "https://gitlab.other.dev", pat: "glpat-new", groupId: 7, groupPath: "acme" } as never, connectionId)

        expect(stored.save).toHaveBeenCalledTimes(1)
        expect(stored).toMatchObject({ accessToken: "glpat-new", gitlabData: { url: "https://gitlab.other.dev" } })
    })

    it("Given a GitLab connection, when it is saved with its URL and the token not typed again, then the stored token is kept", async () => {
        await service().editRepositoryGitlabRaw({ name: "renamed", url: "https://gitlab.acme.dev", pat: "", groupId: 7, groupPath: "acme" } as never, connectionId)

        expect(stored.save).toHaveBeenCalledTimes(1)
        expect(stored).toMatchObject({ name: "renamed", accessToken: STORED_TOKEN })
    })
})
