import { Types } from "mongoose"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { parse } from "yaml"

vi.mock("..", () => ({ fastify: { log: { error: vi.fn(), warn: vi.fn() }, config: { REPOSITORIES_FOLDER: "/repositories" } } }))

import ArgoCdClient, { ArgoCdResource } from "../client/ArgoCdClient"
import GitlabClient from "../client/GitlabClient"
import { createBusinessException } from "../errors/BusinessException"
import CodeRepository from "../models/CodeRepositoryModel"
import Environment from "../models/EnvironmentModel"
import Project, { IArgoCdRepositoryCredential, IProjectArgoCd } from "../models/ProjectModel"
import ArgoCdService from "./ArgoCdService"
import GitOpsService, { renderNamespace } from "./GitOpsService"
import { applicationSetName, appProjectName, configurationApplicationName, PROJECT_ID_LABEL } from "./gitops/argoCdManifests"

const projectId = new Types.ObjectId()
const gitlabConnectionId = new Types.ObjectId()
const githubConnectionId = new Types.ObjectId()
const gitlabConnection = {
    _id: gitlabConnectionId,
    name: "GitLab",
    provider: "GITLAB",
    accessToken: "glpat-connection",
    gitlabData: { url: "https://gitlab.example.com", groupId: 1, groupPath: "acme" }
}
const githubConnection = { _id: githubConnectionId, name: "GitHub", provider: "GITHUB", accessToken: "ghp-connection", githubData: { organizationId: "acme" } }
const configurationLink = { enabled: true, codeRepositoryId: gitlabConnectionId, repositoryId: "101", name: "shop-config", repositoryData: {}, gitlab: { path: "acme/shop-config" } }
const applicationsLink = { enabled: true, codeRepositoryId: githubConnectionId, repositoryId: "202", name: "shop-apps", repositoryData: {} }
const ARGO_URL = "https://argocd.example.com"
const CONFIG_REPO = "https://gitlab.example.com/acme/shop-config.git"
const APPS_REPO = "https://github.com/acme/shop-apps.git"
const PROJECT_NAME = appProjectName(String(projectId), "shop")
const configName = (environment: string) => configurationApplicationName(String(projectId), "shop", environment)
const applicationSetNameOf = (environment: string) => applicationSetName(String(projectId), "shop", environment)

/** Every call to Argo CD and to GitLab, in the order it was made */
let calls: string[]
let saved: IProjectArgoCd[]
/** The filter of every save, for the lease it matched on */
let saveFilters: Array<Record<string, unknown>>
let previous: IProjectArgoCd | undefined
let gitOps: Record<string, unknown>
let applications: ArgoCdResource[]
let applicationSets: ArgoCdResource[]

const resource = (name: string, spec: Record<string, unknown> = { project: PROJECT_NAME }, labels: Record<string, string> = {}): ArgoCdResource => ({
    metadata: { name, labels: { [PROJECT_ID_LABEL]: String(projectId), ...labels } },
    spec
})

const deployTokenCredential = (overrides: Partial<IArgoCdRepositoryCredential> = {}): IArgoCdRepositoryCredential => ({
    source: "deployToken",
    username: "gitlab+deploy-token-7",
    password: "gldt-old",
    deployTokenId: 7,
    gitlabProjectId: 101,
    argoCdUrl: ARGO_URL,
    repoUrl: CONFIG_REPO,
    argoProject: PROJECT_NAME,
    codeRepositoryId: String(gitlabConnectionId),
    ...overrides
})

const manualCredential = (overrides: Partial<IArgoCdRepositoryCredential> = {}): IArgoCdRepositoryCredential => ({
    source: "manual",
    username: "x-access-token",
    password: "ghp-stored",
    argoCdUrl: ARGO_URL,
    repoUrl: APPS_REPO,
    codeRepositoryId: String(githubConnectionId),
    ...overrides
})

beforeEach(() => {
    calls = []
    saved = []
    saveFilters = []
    previous = undefined
    gitOps = { enabled: true, codeRepository: configurationLink, applicationsCodeRepository: applicationsLink }
    applications = []
    applicationSets = []

    vi.spyOn(ArgoCdService.prototype as unknown as { ensureAccessToProject: () => Promise<void> }, "ensureAccessToProject").mockResolvedValue(undefined)
    vi.spyOn(GitOpsService.prototype, "ensureOwner").mockResolvedValue(undefined)
    vi.spyOn(Project, "findById").mockImplementation(() => ({ _id: projectId, slug: "shop", organizationId: new Types.ObjectId(), gitOps, argoCd: previous }) as never)
    vi.spyOn(Project, "findOneAndUpdate").mockResolvedValue({ _id: projectId } as never)
    vi.spyOn(Project, "updateOne").mockImplementation(((filter: Record<string, unknown>, update: { $set?: { argoCd: IProjectArgoCd } }) => {
        if (update.$set) {
            saved.push(update.$set.argoCd)
            saveFilters.push(filter)
        }
        return Promise.resolve({ matchedCount: 1 })
    }) as never)
    vi.spyOn(Environment, "find").mockResolvedValue([
        { slug: "development", projectId },
        { slug: "production", namespace: "prod", projectId }
    ] as never)
    vi.spyOn(CodeRepository, "findOne").mockImplementation(((filter: { _id: unknown }) =>
        Promise.resolve(String(filter._id) === String(gitlabConnectionId) ? gitlabConnection : githubConnection)) as never)
    vi.spyOn(CodeRepository, "find").mockResolvedValue([gitlabConnection, githubConnection] as never)

    vi.spyOn(ArgoCdClient.prototype, "getUserInfo").mockImplementation(async () => {
        calls.push("argo:userinfo")
        return { loggedIn: true, username: "orchestrator" }
    })
    vi.spyOn(ArgoCdClient.prototype, "getProject").mockResolvedValue(null)
    vi.spyOn(ArgoCdClient.prototype, "getApplication").mockResolvedValue(null)
    vi.spyOn(ArgoCdClient.prototype, "getApplicationSet").mockResolvedValue(null)
    vi.spyOn(ArgoCdClient.prototype, "getRepository").mockResolvedValue(null)
    vi.spyOn(ArgoCdClient.prototype, "upsertProject").mockImplementation(async project => {
        calls.push(`argo:upsertProject:${project.metadata.name}`)
    })
    vi.spyOn(ArgoCdClient.prototype, "upsertRepository").mockImplementation(async repository => {
        calls.push(`argo:upsertRepository:${repository.repo}:${repository.username}:${repository.password}:${repository.project ?? "global"}`)
    })
    vi.spyOn(ArgoCdClient.prototype, "deleteRepository").mockImplementation(async (repo, project) => {
        calls.push(`argo:deleteRepository:${repo}:${project ?? "global"}`)
    })
    vi.spyOn(ArgoCdClient.prototype, "upsertApplication").mockImplementation(async application => {
        calls.push(`argo:upsertApplication:${application.metadata.name}`)
    })
    vi.spyOn(ArgoCdClient.prototype, "upsertApplicationSet").mockImplementation(async applicationSet => {
        calls.push(`argo:upsertApplicationSet:${applicationSet.metadata.name}`)
    })
    vi.spyOn(ArgoCdClient.prototype, "listApplications").mockImplementation(async () => applications)
    vi.spyOn(ArgoCdClient.prototype, "listApplicationSets").mockImplementation(async () => applicationSets)
    vi.spyOn(ArgoCdClient.prototype, "deleteApplication").mockImplementation(async name => {
        calls.push(`argo:deleteApplication:${name}`)
    })
    vi.spyOn(ArgoCdClient.prototype, "deleteApplicationSet").mockImplementation(async name => {
        calls.push(`argo:deleteApplicationSet:${name}`)
    })
    vi.spyOn(GitlabClient.prototype, "getProject").mockResolvedValue({ id: 101, name: "shop-config", path_with_namespace: "acme/shop-config" })
    vi.spyOn(GitlabClient.prototype, "createDeployToken").mockImplementation(async gitlabProjectId => {
        calls.push(`gitlab:createDeployToken:${gitlabProjectId}`)
        return { id: 8, username: "gitlab+deploy-token-8", token: "gldt-new" }
    })
    vi.spyOn(GitlabClient.prototype, "revokeDeployToken").mockImplementation(async (gitlabProjectId, tokenId) => {
        calls.push(`gitlab:revokeDeployToken:${gitlabProjectId}:${tokenId}`)
    })
})

afterEach(() => {
    vi.restoreAllMocks()
})

const initialize = (input: Partial<{ url: string; token: string; repositoryToken: string }> = {}) =>
    new ArgoCdService().initialize(String(projectId), { url: `${ARGO_URL}/`, token: "argo-token", repositoryToken: "ghp-read-only", ...input })

describe("ArgoCdService.initialize", () => {
    it("given a token Argo CD refuses, when it is initialized, then nothing is written to Argo CD or GitLab and the failure is stored by code", async () => {
        vi.mocked(ArgoCdClient.prototype.getUserInfo).mockRejectedValue(createBusinessException({ code: "ARGOCD_UNAUTHORIZED", message: "refused", statusCode: 422, details: { url: ARGO_URL } }))

        await expect(initialize()).rejects.toMatchObject({ code: "ARGOCD_UNAUTHORIZED" })

        expect(calls).toEqual([])
        expect(saved).toEqual([{ lastError: { code: "ARGOCD_UNAUTHORIZED", message: "refused", details: { url: ARGO_URL } }, pendingRepositoryDeletions: [], initializingAt: expect.any(Date) }])
    })

    it("given a project, when it is initialized, then the token is checked before anything else", async () => {
        await initialize()

        expect(calls[0]).toBe("argo:userinfo")
    })

    it("given an initialization running, when another one starts, then it is refused as busy and nothing is called", async () => {
        vi.mocked(Project.findOneAndUpdate).mockResolvedValue(null as never)

        await expect(initialize()).rejects.toMatchObject({ code: "ARGOCD_BUSY", statusCode: 409 })

        expect(calls).toEqual([])
    })

    it("given a project, when it is initialized, then the lease is released at the end", async () => {
        await initialize()

        expect(Project.updateOne).toHaveBeenLastCalledWith({ _id: expect.anything(), "argoCd.initializingAt": expect.any(Date) }, { $unset: { "argoCd.initializingAt": 1 } })
    })

    it("given another run that rotated the tokens before the lease was taken, when it is initialized, then the credentials read under the lease are the ones retired", async () => {
        const stale = { url: ARGO_URL, token: "argo-token", repositories: { configuration: deployTokenCredential({ deployTokenId: 6 }) } }
        previous = { url: ARGO_URL, token: "argo-token", repositories: { configuration: deployTokenCredential({ deployTokenId: 7 }) } }
        vi.mocked(Project.findById).mockImplementationOnce(() => ({ _id: projectId, slug: "shop", organizationId: new Types.ObjectId(), gitOps, argoCd: stale }) as never)

        await initialize()

        expect(calls).toContain("gitlab:revokeDeployToken:101:7")
        expect(calls).not.toContain("gitlab:revokeDeployToken:101:6")
    })

    it("given a run, when it saves, then every save matches the lease the save before renewed", async () => {
        await initialize()

        expect(saveFilters.length).toBeGreaterThan(1)
        const acquired = (vi.mocked(Project.findOneAndUpdate).mock.calls[0][1] as { $set: Record<string, unknown> }).$set["argoCd.initializingAt"]
        expect(saveFilters[0]["argoCd.initializingAt"]).toBe(acquired)
        for (let index = 1; index < saveFilters.length; index++) {
            expect(saveFilters[index]["argoCd.initializingAt"]).toEqual(saved[index - 1].initializingAt)
        }
    })

    it("given the lease taken over by another run, when it saves, then it stops as ARGOCD_LEASE_LOST and the deploy token it could not store is revoked", async () => {
        vi.mocked(Project.updateOne).mockImplementation(((_filter: unknown, update: { $set?: unknown }) => Promise.resolve({ matchedCount: update.$set ? 0 : 1 })) as never)

        await expect(initialize()).rejects.toMatchObject({ code: "ARGOCD_LEASE_LOST", statusCode: 409 })

        expect(calls).toContain("gitlab:revokeDeployToken:101:8")
        expect(calls.some(call => call.startsWith("argo:upsertApplication"))).toBe(false)
    })

    it("given a GitLab repository with a deploy token, when it is initialized again, then a new token is created, handed to Argo CD and only then the old one revoked", async () => {
        previous = { url: ARGO_URL, token: "argo-token", repositories: { configuration: deployTokenCredential() } }

        await initialize()

        const rotation = calls.filter(call => call.startsWith("gitlab:") || call.includes("shop-config"))
        expect(rotation).toEqual(["gitlab:createDeployToken:101", `argo:upsertRepository:${CONFIG_REPO}:gitlab+deploy-token-8:gldt-new:${PROJECT_NAME}`, "gitlab:revokeDeployToken:101:7"])
    })

    it("given both repositories, when it is initialized, then the configuration one is scoped to the AppProject and the applications one is global", async () => {
        await initialize()

        expect(calls).toContain(`argo:upsertRepository:${CONFIG_REPO}:gitlab+deploy-token-8:gldt-new:${PROJECT_NAME}`)
        expect(calls).toContain(`argo:upsertRepository:${APPS_REPO}:x-access-token:ghp-read-only:global`)
    })

    it("given a GitHub repository and no token pasted nor stored, when it is initialized, then it is refused and the failure is stored", async () => {
        await expect(initialize({ repositoryToken: undefined })).rejects.toMatchObject({ code: "ARGOCD_REPOSITORY_TOKEN_REQUIRED" })

        expect(calls.some(call => call.includes("shop-apps"))).toBe(false)
        expect(saved.at(-1)?.lastError).toMatchObject({ code: "ARGOCD_REPOSITORY_TOKEN_REQUIRED", details: { repository: "shop-apps" } })
    })

    it("given a repository token stored, when it is initialized without one, then the stored one is used for GitHub", async () => {
        previous = { url: ARGO_URL, token: "argo-token", repositories: { applications: manualCredential() } }

        await initialize({ repositoryToken: undefined, token: "••••••••••••" })

        expect(calls).toContain(`argo:upsertRepository:${APPS_REPO}:x-access-token:ghp-stored:global`)
    })

    it("given a repository token stored, when it is initialized against another URL without one, then the stored one is not sent there", async () => {
        previous = { url: ARGO_URL, token: "argo-token", repositories: { applications: manualCredential() } }

        await expect(initialize({ url: "https://elsewhere.example.com", repositoryToken: undefined })).rejects.toMatchObject({ code: "ARGOCD_REPOSITORY_TOKEN_REQUIRED" })

        expect(calls.some(call => call.includes("ghp-stored"))).toBe(false)
    })

    it("given an Argo CD that refuses the repository, when the deploy token was just created, then that token is revoked", async () => {
        vi.mocked(ArgoCdClient.prototype.upsertRepository).mockRejectedValue(createBusinessException({ code: "ARGOCD_FORBIDDEN", message: "forbidden", statusCode: 422 }))

        await expect(initialize()).rejects.toMatchObject({ code: "ARGOCD_FORBIDDEN" })

        expect(calls).toContain("gitlab:revokeDeployToken:101:8")
        expect(saved.at(-1)?.repositories).toEqual({})
    })

    it("given a credential handed to Argo CD, when a later step fails, then it was stored before the failure", async () => {
        vi.mocked(ArgoCdClient.prototype.upsertApplication).mockRejectedValue(new Error("boom"))

        await expect(initialize()).rejects.toThrow("boom")

        expect(saved[0].repositories?.configuration).toMatchObject({ source: "deployToken", password: "gldt-new", deployTokenId: 8, gitlabProjectId: 101, repoUrl: CONFIG_REPO })
        expect(saved.at(-1)).toMatchObject({ url: ARGO_URL, token: "argo-token", lastError: { message: "boom" }, repositories: { configuration: { password: "gldt-new" } } })
    })

    it("given the failure cannot be stored, when it is initialized, then the original error goes on", async () => {
        vi.mocked(ArgoCdClient.prototype.upsertApplication).mockRejectedValue(new Error("boom"))
        vi.mocked(Project.updateOne).mockImplementation(((_filter: unknown, update: { $set?: { argoCd: IProjectArgoCd } }) =>
            update.$set?.argoCd.lastError ? Promise.reject(new Error("database down")) : Promise.resolve({ matchedCount: 1 })) as never)

        await expect(initialize()).rejects.toThrow("boom")
    })

    it("given an environment deleted since, when it is initialized again, then its Application and ApplicationSet are deleted and the generated applications are left alone", async () => {
        applications = [resource(configName("development")), resource(configName("staging"))]
        applicationSets = [
            resource(applicationSetNameOf("production"), { template: { spec: { project: PROJECT_NAME } } }),
            resource(applicationSetNameOf("staging"), { template: { spec: { project: PROJECT_NAME } } })
        ]

        await initialize()

        expect(calls.filter(call => call.startsWith("argo:delete"))).toEqual([`argo:deleteApplication:${configName("staging")}`, `argo:deleteApplicationSet:${applicationSetNameOf("staging")}`])
        expect(ArgoCdClient.prototype.listApplications).toHaveBeenCalledWith(`${PROJECT_ID_LABEL}=${projectId},mfe-orchestrator/component=configuration`, PROJECT_NAME)
    })

    it("given a labelled Application of another AppProject, when it is initialized, then it is not deleted", async () => {
        applications = [resource(configName("staging"), { project: "someone-else" })]

        await initialize()

        expect(calls.some(call => call.startsWith("argo:deleteApplication"))).toBe(false)
    })

    it("given an applications repository no longer linked, when it is initialized again, then its registration is deleted and its credentials forgotten", async () => {
        previous = { url: ARGO_URL, token: "argo-token", repositories: { applications: manualCredential() } }
        gitOps = { enabled: true, codeRepository: configurationLink }

        await initialize()

        expect(calls).toContain(`argo:deleteRepository:${APPS_REPO}:global`)
        expect(saved.at(-1)?.repositories).not.toHaveProperty("applications")
    })

    it("given a configuration repository moved to GitHub, when it is initialized again, then the old registration is deleted and the old deploy token revoked through its own connection", async () => {
        previous = { url: ARGO_URL, token: "argo-token", repositories: { configuration: deployTokenCredential() } }
        gitOps = { enabled: true, codeRepository: { ...applicationsLink, name: "shop-config-gh" } }

        await initialize()

        expect(calls).toContain(`argo:deleteRepository:${CONFIG_REPO}:${PROJECT_NAME}`)
        expect(calls).toContain("gitlab:revokeDeployToken:101:7")
    })

    it("given another Argo CD URL, when it is initialized, then the old registrations are left there but the old deploy tokens are revoked", async () => {
        previous = { url: "https://old.example.com", token: "old-token", repositories: { configuration: deployTokenCredential({ argoCdUrl: "https://old.example.com" }) } }

        await initialize()

        expect(calls.some(call => call.startsWith("argo:deleteRepository"))).toBe(false)
        expect(calls).toContain("gitlab:revokeDeployToken:101:7")
    })

    it("given a repository registered in Argo CD by someone else, when it is initialized, then it is refused before anything is written", async () => {
        vi.mocked(ArgoCdClient.prototype.getRepository).mockImplementation(async repo => (repo === APPS_REPO ? { repo } : null))

        await expect(initialize()).rejects.toMatchObject({ code: "ARGOCD_REPOSITORY_CONFLICT" })

        expect(calls.some(call => call.startsWith("argo:upsert") || call.startsWith("gitlab:"))).toBe(false)
    })

    it("given a project, when it is initialized, then each environment gets its Application and its ApplicationSet", async () => {
        await initialize()

        expect(calls).toEqual(
            expect.arrayContaining([
                `argo:upsertProject:${PROJECT_NAME}`,
                `argo:upsertApplication:${configName("development")}`,
                `argo:upsertApplication:${configName("production")}`,
                `argo:upsertApplicationSet:${applicationSetNameOf("development")}`,
                `argo:upsertApplicationSet:${applicationSetNameOf("production")}`
            ])
        )
    })

    it("given a success, when it is initialized, then the URL has no trailing slash, the error is cleared and the answer holds no credential", async () => {
        previous = { url: ARGO_URL, token: "argo-token", lastError: { message: "earlier" } }

        const status = await initialize()

        expect(saved.at(-1)).toMatchObject({ url: ARGO_URL, token: "argo-token", initializedAt: expect.any(Date) })
        expect(saved.at(-1)?.lastError).toBeUndefined()
        expect(status).toMatchObject({ url: ARGO_URL, configured: true, needsRepositoryToken: true, repositoryTokenProviders: ["GITHUB"], repositoryTokenStored: true, canInitialize: true })
        expect(JSON.stringify(status)).not.toMatch(/argo-token|gldt-new|ghp-read-only/)
    })

    it.each([
        ["AppProject", "getProject"],
        ["Application", "getApplication"],
        ["ApplicationSet", "getApplicationSet"]
    ] as const)("given an %s of the same name made for another project, when it is initialized, then it is refused before anything is written", async (_kind, method) => {
        vi.mocked(ArgoCdClient.prototype[method]).mockResolvedValue(resource("taken", {}, { [PROJECT_ID_LABEL]: "someone-else" }))

        await expect(initialize()).rejects.toMatchObject({ code: "ARGOCD_NAME_CONFLICT" })

        expect(calls.some(call => call.startsWith("argo:upsert") || call.startsWith("gitlab:"))).toBe(false)
    })

    it.each([
        ["getProject", "ARGOCD_NAME_CONFLICT"],
        ["getApplication", "ARGOCD_NAME_CONFLICT"],
        ["getApplicationSet", "ARGOCD_NAME_CONFLICT"],
        ["getRepository", "ARGOCD_REPOSITORY_CONFLICT"]
    ] as const)("given %s refused as forbidden, when it is initialized, then something the account cannot see is there and it is refused as %s", async (method, code) => {
        vi.mocked(ArgoCdClient.prototype[method]).mockRejectedValue(createBusinessException({ code: "ARGOCD_FORBIDDEN", message: "forbidden", statusCode: 422 }))

        await expect(initialize()).rejects.toMatchObject({ code })

        expect(calls.some(call => call.startsWith("argo:upsert") || call.startsWith("gitlab:"))).toBe(false)
    })

    it("given a registration Argo CD does not delete, when the repository is no longer linked, then it is kept for the next run while its credentials go", async () => {
        previous = { url: ARGO_URL, token: "argo-token", repositories: { applications: manualCredential() } }
        gitOps = { enabled: true, codeRepository: configurationLink }
        vi.mocked(ArgoCdClient.prototype.deleteRepository).mockRejectedValue(new Error("argo down"))

        await initialize()

        expect(saved.at(-1)?.pendingRepositoryDeletions).toEqual([{ argoCdUrl: ARGO_URL, repoUrl: APPS_REPO, argoProject: undefined }])
        expect(saved.at(-1)?.repositories).not.toHaveProperty("applications")
    })

    it("given a registration left by an earlier run, when it is initialized again, then its deletion is retried and it goes once done", async () => {
        previous = { url: ARGO_URL, token: "argo-token", pendingRepositoryDeletions: [{ argoCdUrl: ARGO_URL, repoUrl: "https://github.com/acme/old.git" }] }

        await initialize()

        expect(calls).toContain("argo:deleteRepository:https://github.com/acme/old.git:global")
        expect(saved.at(-1)?.pendingRepositoryDeletions).toEqual([])
    })

    it("given another URL and no token, when it is initialized, then the stored token is not sent there", async () => {
        previous = { url: ARGO_URL, token: "argo-token" }

        await expect(initialize({ url: "https://elsewhere.example.com", token: undefined })).rejects.toMatchObject({ code: "ARGOCD_TOKEN_REQUIRED" })

        expect(calls).toEqual([])
    })

    it("given an http URL, when the installation does not allow it, then it is refused", async () => {
        await expect(initialize({ url: "http://argocd.example.com" })).rejects.toMatchObject({ code: "ARGOCD_URL_INSECURE" })

        expect(calls).toEqual([])
    })

    it("given GitOps turned off, when it is initialized, then it is refused", async () => {
        gitOps = { enabled: false }

        await expect(initialize()).rejects.toMatchObject({ code: "ARGOCD_GITOPS_REQUIRED" })
    })

    it("given someone who is not an owner, when it is initialized, then it is refused", async () => {
        vi.mocked(GitOpsService.prototype.ensureOwner).mockRejectedValue(Object.assign(new Error("owner"), { code: "GITOPS_OWNER_REQUIRED" }))

        await expect(initialize()).rejects.toMatchObject({ code: "GITOPS_OWNER_REQUIRED" })
        expect(calls).toEqual([])
    })
})

describe("ArgoCdService.get", () => {
    it("given stored credentials, when the status is read, then only their source comes back", async () => {
        previous = {
            url: ARGO_URL,
            token: "argo-token",
            initializedAt: new Date(),
            repositories: { configuration: deployTokenCredential(), applications: manualCredential() }
        }

        const status = await new ArgoCdService().get(String(projectId))

        expect(status.repositories).toEqual({ configuration: { source: "deployToken" }, applications: { source: "manual" } })
        expect(JSON.stringify(status)).not.toMatch(/argo-token|gldt-old|ghp-stored/)
    })

    it("given someone who is not an owner, when the status is read, then it comes back without the right to initialize", async () => {
        vi.mocked(GitOpsService.prototype.ensureOwner).mockRejectedValue(new Error("owner"))

        expect((await new ArgoCdService().get(String(projectId))).canInitialize).toBe(false)
    })
})

describe("Project serialization", () => {
    it("given a project with Argo CD credentials, when it is serialized, then Argo CD is left out", () => {
        const project = new Project({ organizationId: new Types.ObjectId(), name: "Shop", slug: "shop", argoCd: { url: ARGO_URL, token: "argo-token" } })

        expect(project.toJSON()).not.toHaveProperty("argoCd")
        expect(JSON.stringify(project)).not.toContain("argo-token")
    })
})

describe("renderNamespace", () => {
    it("given an environment, when its Namespace is rendered, then Argo CD never prunes nor deletes it", () => {
        expect(parse(renderNamespace({ slug: "production" })).metadata.annotations).toEqual({ "argocd.argoproj.io/sync-options": "Prune=false,Delete=false" })
    })
})
