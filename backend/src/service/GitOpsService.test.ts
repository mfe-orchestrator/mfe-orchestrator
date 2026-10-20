import { Types } from "mongoose"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { parse } from "yaml"

vi.mock("..", () => ({ fastify: { log: { error: vi.fn() }, config: { REPOSITORIES_FOLDER: "/repositories" } } }))

import CodeRepository from "../models/CodeRepositoryModel"
import Environment from "../models/EnvironmentModel"
import Project from "../models/ProjectModel"
import { ConfigMap, Secret } from "../models/VariableMapModel"
import CodeRepositoryImportService from "./CodeRepositoryImportService"
import GitOpsService, { renderManifest } from "./GitOpsService"

const projectId = new Types.ObjectId()
const development = new Types.ObjectId()
const production = new Types.ObjectId()
const connectionId = new Types.ObjectId()
const link = { enabled: true, codeRepositoryId: connectionId, repositoryId: "42", name: "platform-config", repositoryData: {} }

type GitOpsFile = { path: string; action: string; content?: string }
type Commit = (message: string, files: GitOpsFile[], options?: { prune?: boolean }) => Promise<GitOpsFile[]>
let commit: ReturnType<typeof vi.fn<Commit>>
type InRepository = (projectId: unknown, link: unknown, codeRepository: unknown, task: (commit: Commit) => Promise<unknown>) => Promise<unknown>

beforeEach(() => {
    vi.spyOn(GitOpsService.prototype as unknown as { ensureAccessToProject: () => Promise<void> }, "ensureAccessToProject").mockResolvedValue(undefined)
    vi.spyOn(GitOpsService.prototype as unknown as { ensureNotViewer: () => Promise<void> }, "ensureNotViewer").mockResolvedValue(undefined)
    vi.spyOn(GitOpsService.prototype as unknown as { ensureOwner: () => Promise<void> }, "ensureOwner").mockResolvedValue(undefined)
    // The repository is not cloned: the task gets a commit that records what it would push
    commit = vi.fn<Commit>().mockResolvedValue([])
    vi.spyOn(GitOpsService.prototype as unknown as { inRepository: InRepository }, "inRepository").mockImplementation((_projectId, _link, _codeRepository, task) => task(commit))
    vi.spyOn(Environment, "find").mockResolvedValue([
        { _id: development, slug: "development" },
        { _id: production, slug: "production" }
    ] as never)
    vi.spyOn(CodeRepository, "findOne").mockResolvedValue({ _id: connectionId, name: "GitHub" } as never)
})

afterEach(() => {
    vi.restoreAllMocks()
})

const map = {
    name: "orders",
    entries: [
        {
            key: "LOG_LEVEL",
            values: [
                { environmentId: String(development), value: "debug" },
                { environmentId: String(production), value: "info" }
            ]
        },
        { key: "FEATURE_X", values: [{ environmentId: String(production), value: "true" }] }
    ]
}

describe("renderManifest", () => {
    it("given a config map, when it is rendered for an environment, then it is a ConfigMap with only the keys set there", () => {
        expect(parse(renderManifest("configMap", map, String(development)))).toEqual({
            apiVersion: "v1",
            kind: "ConfigMap",
            metadata: { name: "orders", labels: { "app.kubernetes.io/managed-by": "mfe-orchestrator" } },
            data: { LOG_LEVEL: "debug" }
        })
    })

    it("given a secret, when it is rendered, then it is an Opaque Secret carrying the values as stringData", () => {
        expect(parse(renderManifest("secret", map, String(production)))).toMatchObject({ kind: "Secret", type: "Opaque", stringData: { LOG_LEVEL: "info", FEATURE_X: "true" } })
    })

    it("given a value YAML would read as another type, when it is rendered, then it stays a string", () => {
        const manifest = parse(renderManifest("configMap", { name: "flags", entries: [{ key: "ENABLED", values: [{ environmentId: String(production), value: "true" }] }] }, String(production)))
        expect(manifest.data.ENABLED).toBe("true")
    })
})

describe("GitOpsService.saveVariableMap", () => {
    const enabled = () => vi.spyOn(Project, "findById").mockResolvedValue({ gitOps: { enabled: true, codeRepository: link } } as never)
    const write = () => vi.fn().mockResolvedValue("saved")

    it("given GitOps off, when a map is saved, then only the write runs", async () => {
        vi.spyOn(Project, "findById").mockResolvedValue({ gitOps: { enabled: false, codeRepository: link } } as never)
        const save = write()

        expect(await new GitOpsService().saveVariableMap(projectId as never, "configMap", async () => ({ before: null, after: map, write: save }))).toBe("saved")
        expect(commit).not.toHaveBeenCalled()
    })

    it("given a new config map, when it is saved, then one file per environment under configMaps/<environment> is committed before the write", async () => {
        enabled()
        const save = write()

        await new GitOpsService().saveVariableMap(projectId as never, "configMap", async () => ({ before: null, after: map, write: save }))

        const [message, files] = commit.mock.calls[0]
        expect(message).toBe("Create config map orders")
        expect(files.map(file => [file.path, file.action])).toEqual([
            ["configMaps/development/orders.yaml", "update"],
            ["configMaps/production/orders.yaml", "update"]
        ])
        expect(commit.mock.invocationCallOrder[0]).toBeLessThan(save.mock.invocationCallOrder[0])
    })

    it("given a renamed secret, when it is saved, then the new files are written under secrets/<environment> and the old ones deleted", async () => {
        enabled()

        await new GitOpsService().saveVariableMap(projectId as never, "secret", async () => ({ before: map, after: { ...map, name: "billing" }, write: write() }))

        const [message, files] = commit.mock.calls[0]
        expect(message).toBe("Rename secret orders to billing")
        expect(files.map(file => [file.path, file.action])).toEqual([
            ["secrets/development/billing.yaml", "update"],
            ["secrets/development/orders.yaml", "delete"],
            ["secrets/production/billing.yaml", "update"],
            ["secrets/production/orders.yaml", "delete"]
        ])
    })

    it("given a deleted config map, when it is saved, then its files are deleted in every environment", async () => {
        enabled()

        await new GitOpsService().saveVariableMap(projectId as never, "configMap", async () => ({ before: map, after: null, write: write() }))

        const [message, files] = commit.mock.calls[0]
        expect(message).toBe("Delete config map orders")
        expect(files.every(file => file.action === "delete")).toBe(true)
    })

    it("given a write that fails after the push, when a map is created, then its files are committed away again", async () => {
        enabled()
        const failing = vi.fn().mockRejectedValue(new Error("duplicate key"))
        const undo = [{ path: "secrets/development/orders.yaml", action: "delete" }]
        commit.mockResolvedValueOnce(undo)

        await expect(new GitOpsService().saveVariableMap(projectId as never, "secret", async () => ({ before: null, after: map, write: failing }))).rejects.toThrow("duplicate key")

        // The revert puts back what the commit answered the branch held, not what the map was assumed to be
        expect(commit.mock.calls[1]).toEqual(["Revert: create secret orders", undo])
    })

    it("given a commit that does not go through, when a map is saved, then the write never runs", async () => {
        enabled()
        commit.mockRejectedValue(new Error("push refused"))
        const save = write()

        await expect(new GitOpsService().saveVariableMap(projectId as never, "configMap", async () => ({ before: null, after: map, write: save }))).rejects.toThrow("push refused")
        expect(save).not.toHaveBeenCalled()
    })

    it("given an environment slug that is not a folder name, when a map is saved, then it is refused", async () => {
        enabled()
        vi.spyOn(Environment, "find").mockResolvedValue([{ _id: production, slug: "../prod" }] as never)

        await expect(new GitOpsService().saveVariableMap(projectId as never, "configMap", async () => ({ before: null, after: map, write: write() }))).rejects.toMatchObject({
            code: "GITOPS_ENVIRONMENT_SLUG_INVALID"
        })
        expect(commit).not.toHaveBeenCalled()
    })
})

describe("GitOpsService.saveVariableMap of a change outside the manifests", () => {
    it("given a change with no after, when it is saved, then only the write runs", async () => {
        vi.spyOn(Project, "findById").mockResolvedValue({ gitOps: { enabled: true, codeRepository: link } } as never)

        expect(await new GitOpsService().saveVariableMap(projectId as never, "configMap", async () => ({ before: map, after: undefined, write: async () => "saved" }))).toBe("saved")
        expect(commit).not.toHaveBeenCalled()
    })
})

describe("GitOpsService.resolveSettings", () => {
    const repository = { repositoryId: "42", name: "platform-config", cloneUrlHttps: "https://github.com/acme/platform-config.git" }

    beforeEach(() => {
        vi.spyOn(CodeRepositoryImportService.prototype, "fetchRepositories").mockResolvedValue([repository])
        vi.spyOn(ConfigMap, "find").mockResolvedValue([map] as never)
        vi.spyOn(Secret, "find").mockResolvedValue([] as never)
        vi.spyOn(Project, "findById").mockResolvedValue({ _id: projectId } as never)
    })

    it("given GitOps turned on, when the settings are resolved, then every map of the project is exported in one pruning commit", async () => {
        const settings = await new GitOpsService().resolveSettings(String(projectId), { enabled: true, codeRepositoryId: String(connectionId), repositoryId: "42" })

        expect(settings).toMatchObject({ enabled: true, codeRepository: { codeRepositoryId: connectionId, repositoryId: "42", name: "platform-config" } })
        expect(commit).toHaveBeenCalledTimes(1)
        const [, files, options] = commit.mock.calls[0]
        expect(files.map(file => file.path)).toEqual(["configMaps/development/orders.yaml", "configMaps/production/orders.yaml"])
        expect(options).toEqual({ prune: true })
    })

    it("given someone who is not an owner, when GitOps is turned on, then it is refused before anything is pushed", async () => {
        vi.mocked((GitOpsService.prototype as unknown as { ensureOwner: () => Promise<void> }).ensureOwner).mockRejectedValue(Object.assign(new Error("owner"), { code: "GITOPS_OWNER_REQUIRED" }))

        await expect(new GitOpsService().resolveSettings(String(projectId), { enabled: true, codeRepositoryId: String(connectionId), repositoryId: "42" })).rejects.toMatchObject({
            code: "GITOPS_OWNER_REQUIRED"
        })
        expect(commit).not.toHaveBeenCalled()
    })

    it("given a repository the connection cannot reach, when GitOps is turned on, then it is refused", async () => {
        await expect(new GitOpsService().resolveSettings(String(projectId), { enabled: true, codeRepositoryId: String(connectionId), repositoryId: "999" })).rejects.toMatchObject({
            code: "GITOPS_REPOSITORY_INVALID"
        })
    })

    it("given a connection of another project, when GitOps is turned on, then it is refused", async () => {
        vi.spyOn(CodeRepository, "findOne").mockResolvedValue(null as never)

        await expect(new GitOpsService().resolveSettings(String(projectId), { enabled: true, codeRepositoryId: String(connectionId), repositoryId: "42" })).rejects.toMatchObject({
            code: "GITOPS_REPOSITORY_INVALID"
        })
    })

    it("given GitOps turned off, when the settings are resolved, then the repository is kept and nothing is committed", async () => {
        vi.spyOn(Project, "findById").mockResolvedValue({ _id: projectId, gitOps: { enabled: true, codeRepository: link } } as never)

        expect(await new GitOpsService().resolveSettings(String(projectId), { enabled: false })).toEqual({ enabled: false, codeRepository: link })
        expect(commit).not.toHaveBeenCalled()
    })
})

describe("GitOpsService.syncEnvironments", () => {
    it("given GitOps on, when the environments change, then everything is exported again with the orphans pruned", async () => {
        vi.spyOn(Project, "findById").mockResolvedValue({ gitOps: { enabled: true, codeRepository: link } } as never)
        vi.spyOn(ConfigMap, "find").mockResolvedValue([] as never)
        vi.spyOn(Secret, "find").mockResolvedValue([map] as never)

        await new GitOpsService().syncEnvironments(String(projectId))

        const [, files, options] = commit.mock.calls[0]
        expect(files.map(file => file.path)).toEqual(["secrets/development/orders.yaml", "secrets/production/orders.yaml"])
        expect(options).toEqual({ prune: true })
    })

    it("given GitOps off, when the environments change, then nothing is committed", async () => {
        vi.spyOn(Project, "findById").mockResolvedValue({ gitOps: { enabled: false } } as never)

        await new GitOpsService().syncEnvironments(String(projectId))

        expect(commit).not.toHaveBeenCalled()
    })
})
