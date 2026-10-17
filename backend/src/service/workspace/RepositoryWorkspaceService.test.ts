import { Types } from "mongoose"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("../..", () => ({ fastify: { log: { warn: vi.fn() }, config: { REPOSITORIES_FOLDER: "/repositories", REPOSITORIES_MAX_SIZE_MB: 500 } } }))

import CodeRepository, { CodeRepositoryProvider, ICodeRepository } from "../../models/CodeRepositoryModel"
import Organization from "../../models/OrganizationModel"
import Project from "../../models/ProjectModel"
import { RepositoryFileService } from "../RepositoryFileService"
import RepositoryWorkspaceService, { cloneUrlFor, gitCredentialsFor, WorkspaceTarget } from "./RepositoryWorkspaceService"
import { RepositoryComponent } from "./repositoryComponent"

const github = { provider: CodeRepositoryProvider.GITHUB, accessToken: "ghs_token", githubData: { organizationId: "acme" } } as unknown as ICodeRepository
const gitlab = { provider: CodeRepositoryProvider.GITLAB, accessToken: "glpat", gitlabData: { url: "https://git.acme.internal" } } as unknown as ICodeRepository

const target = (codeRepository: ICodeRepository, mfeRepository: Record<string, unknown> = {}): WorkspaceTarget => ({
    codeRepository,
    repositoryName: "catalog",
    component: { kind: "microfrontend", codeRepository: { enabled: true, ...mfeRepository } } as unknown as RepositoryComponent
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

    const projectId = new Types.ObjectId()
    const component = (kind: RepositoryComponent["kind"]) =>
        ({
            kind,
            _id: new Types.ObjectId(),
            projectId,
            slug: "catalog",
            name: "Catalog",
            codeRepository: { enabled: true, codeRepositoryId: new Types.ObjectId(), name: "catalog" },
            env: []
        }) as unknown as RepositoryComponent

    const opened = (kind: RepositoryComponent["kind"]) => {
        vi.spyOn(RepositoryWorkspaceService.prototype as unknown as { ensureAccessToProject: () => Promise<void> }, "ensureAccessToProject").mockResolvedValue(undefined)
        vi.spyOn(CodeRepository, "findById").mockResolvedValue({ ...github, projectId } as never)
        vi.spyOn(Project, "findById").mockResolvedValue({ _id: projectId, slug: "portal", organizationId: new Types.ObjectId() } as never)
        vi.spyOn(Organization, "findById").mockResolvedValue({ _id: new Types.ObjectId(), slug: "acme" } as never)
        vi.spyOn(RepositoryFileService.prototype, "getDefaultBranch").mockResolvedValue("main")
        return new RepositoryWorkspaceService().open(component(kind))
    }

    it("Given a microfrontend pointing at the connection of another project, when it is opened, then it is refused", async () => {
        vi.spyOn(RepositoryWorkspaceService.prototype as unknown as { ensureAccessToProject: () => Promise<void> }, "ensureAccessToProject").mockResolvedValue(undefined)
        vi.spyOn(CodeRepository, "findById").mockResolvedValue({ ...github, projectId: new Types.ObjectId() } as never)

        await expect(new RepositoryWorkspaceService().open(component("microfrontend"))).rejects.toThrow(/does not belong to this project/)
    })

    it("Given a component without a repository, when it is opened, then it is refused naming its kind", async () => {
        vi.spyOn(RepositoryWorkspaceService.prototype as unknown as { ensureAccessToProject: () => Promise<void> }, "ensureAccessToProject").mockResolvedValue(undefined)

        await expect(new RepositoryWorkspaceService().open({ ...component("service"), codeRepository: undefined })).rejects.toThrow(/This service has no code repository/)
    })

    it("Given a service and a microfrontend of the same slug, when both are opened, then their working copies live in different folders", async () => {
        const microfrontendCopy = await opened("microfrontend")
        const serviceCopy = await opened("service")

        expect(microfrontendCopy.workingCopy.dir).toMatch(/\/catalog$/)
        expect(serviceCopy.workingCopy.dir).toMatch(/\/catalog\.service$/)
        expect(serviceCopy.target.component.kind).toBe("service")
        expect(serviceCopy.defaultBranch).toBe("main")
    })
})
