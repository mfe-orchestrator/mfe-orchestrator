import { Types } from "mongoose"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("../..", () => ({ fastify: { log: { warn: vi.fn() }, config: { REPOSITORIES_FOLDER: "/repositories", REPOSITORIES_MAX_SIZE_MB: 500 } } }))

import { CodeRepositoryProvider, ICodeRepository } from "../../models/CodeRepositoryModel"
import Microfrontend, { IMicrofrontend } from "../../models/MicrofrontendModel"
import { RepositoryFileService, RepositoryTarget } from "../RepositoryFileService"
import RepositoryWorkspaceService, { cloneUrlFor, gitCredentialsFor } from "./RepositoryWorkspaceService"

const github = { provider: CodeRepositoryProvider.GITHUB, accessToken: "ghs_token", githubData: { organizationId: "acme" } } as unknown as ICodeRepository
const gitlab = { provider: CodeRepositoryProvider.GITLAB, accessToken: "glpat", gitlabData: { url: "https://git.acme.internal" } } as unknown as ICodeRepository

const target = (codeRepository: ICodeRepository, mfeRepository: Record<string, unknown> = {}): RepositoryTarget => ({
    codeRepository,
    repositoryName: "catalog",
    microfrontend: { codeRepository: { enabled: true, ...mfeRepository } } as unknown as IMicrofrontend
})

describe("cloneUrlFor", () => {
    it("Given a stored URL on the provider's host, when the URL is built, then it is used without credentials", () => {
        expect(cloneUrlFor(target(github, { cloneUrlHttps: "https://user:pass@github.com/acme/catalog.git" }))).toBe("https://github.com/acme/catalog.git")
    })

    it("Given a stored URL on another host, when the URL is built, then it is ignored and the token is not sent there", () => {
        expect(cloneUrlFor(target(github, { cloneUrlHttps: "https://evil.example/catalog.git" }))).toBe("https://github.com/acme/catalog.git")
    })

    it("Given a stored plain-http URL, when the URL is built, then it is ignored", () => {
        expect(cloneUrlFor(target(gitlab, { cloneUrlHttps: "http://git.acme.internal/web/catalog.git", gitlab: { path: "web/catalog" } }))).toBe("https://git.acme.internal/web/catalog.git")
    })

    it("Given a self-hosted GitLab, when the URL is built, then its own host is accepted", () => {
        expect(cloneUrlFor(target(gitlab, { cloneUrlHttps: "https://git.acme.internal/web/catalog.git" }))).toBe("https://git.acme.internal/web/catalog.git")
    })

    it("Given each provider, then the token goes in the password with the username the provider expects", () => {
        expect(gitCredentialsFor(github)).toEqual({ username: "x-access-token", password: "ghs_token" })
        expect(gitCredentialsFor(gitlab)).toEqual({ username: "oauth2", password: "glpat" })
    })
})

describe("RepositoryWorkspaceService.open", () => {
    afterEach(() => vi.restoreAllMocks())

    it("Given a microfrontend pointing at the connection of another project, when it is opened, then it is refused", async () => {
        const projectId = new Types.ObjectId()
        const microfrontend = { _id: new Types.ObjectId(), projectId, slug: "catalog", codeRepository: { enabled: true } }
        vi.spyOn(Microfrontend, "findById").mockResolvedValue(microfrontend as never)
        vi.spyOn(RepositoryWorkspaceService.prototype as unknown as { ensureAccessToMicrofrontend: () => Promise<void> }, "ensureAccessToMicrofrontend").mockResolvedValue(undefined)
        vi.spyOn(RepositoryFileService.prototype, "resolveTargets").mockResolvedValue([
            { microfrontend, repositoryName: "catalog", codeRepository: { ...github, projectId: new Types.ObjectId() } } as unknown as RepositoryTarget
        ])

        await expect(new RepositoryWorkspaceService().open(microfrontend._id.toString())).rejects.toThrow(/does not belong to this project/)
    })
})
