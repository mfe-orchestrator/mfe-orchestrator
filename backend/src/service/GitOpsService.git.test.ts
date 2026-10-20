import fs from "node:fs"
import http from "node:http"
import { AddressInfo } from "node:net"
import os from "node:os"
import path from "node:path"
import { Types } from "mongoose"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { parse } from "yaml"
import { hasGit, run, startGitServer } from "./__fixtures__/gitHttpServer"

/** What the mocks below read once the remote is up: they are hoisted above the code that starts it */
const remote = vi.hoisted(() => ({ url: "", root: "" }))

vi.mock("..", () => ({
    fastify: {
        log: { error: vi.fn(), warn: vi.fn() },
        config: {
            get REPOSITORIES_FOLDER() {
                return remote.root
            }
        }
    }
}))
// The Redis lock is not under test: the task runs straight away
vi.mock("../utils/repositoryLock", () => ({ RepositoryLockTimeoutError: class extends Error {}, withRepositoryLock: (_name: string, task: () => unknown) => task() }))
// The remote is a local git server, not a provider host: the clone URL points there and the size checks are skipped
vi.mock("./workspace/RepositoryWorkspaceService", async importOriginal => ({
    ...(await importOriginal<typeof import("./workspace/RepositoryWorkspaceService")>()),
    cloneUrlFor: () => remote.url,
    default: class {
        prepare({ workingCopy }: { workingCopy: { prepare: (branch: string) => Promise<string> } }, branch: string) {
            return workingCopy.prepare(branch)
        }
    }
}))

import CodeRepository from "../models/CodeRepositoryModel"
import Environment from "../models/EnvironmentModel"
import Organization from "../models/OrganizationModel"
import Project from "../models/ProjectModel"
import GitOpsService from "./GitOpsService"
import { RepositoryFileService } from "./RepositoryFileService"

const projectId = new Types.ObjectId()
const production = new Types.ObjectId()
const connectionId = new Types.ObjectId()
const link = { enabled: true, codeRepositoryId: connectionId, repositoryId: "42", name: "platform-config", repositoryData: {} }

describe.skipIf(!hasGit)("GitOpsService against a local smart HTTP remote", () => {
    let tmp: string
    let bare: string
    let server: http.Server

    const show = (file: string) => run(bare, "show", `main:${file}`)
    const log = () => run(bare, "log", "--format=%s", "main").split("\n")

    beforeAll(async () => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gitops-"))
        bare = path.join(tmp, "remote", "platform-config.git")
        run(tmp, "init", "--bare", "--initial-branch=main", bare)
        run(bare, "config", "http.receivepack", "true")
        const seed = path.join(tmp, "seed")
        run(tmp, "clone", bare, seed)
        fs.writeFileSync(path.join(seed, "README.md"), "# platform config\n")
        run(seed, "add", ".")
        run(seed, "commit", "-m", "init")
        run(seed, "push", "origin", "main")

        server = await startGitServer(path.join(tmp, "remote"))
        remote.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/platform-config.git`
        remote.root = path.join(tmp, "workspaces")
    })

    afterAll(() => {
        server?.close()
        fs.rmSync(tmp, { recursive: true, force: true })
    })

    beforeEach(() => {
        vi.spyOn(GitOpsService.prototype as unknown as { ensureNotViewer: () => Promise<void> }, "ensureNotViewer").mockResolvedValue(undefined)
        vi.spyOn(RepositoryFileService.prototype, "getDefaultBranch").mockResolvedValue("main")
        vi.spyOn(Project, "findById").mockResolvedValue({ _id: projectId, slug: "shop", organizationId: new Types.ObjectId(), gitOps: { enabled: true, codeRepository: link } } as never)
        vi.spyOn(Organization, "findById").mockResolvedValue({ _id: new Types.ObjectId(), slug: "acme" } as never)
        vi.spyOn(CodeRepository, "findOne").mockResolvedValue({ _id: connectionId, provider: "GITHUB", accessToken: "token", githubData: { organizationId: "acme" } } as never)
        vi.spyOn(Environment, "find").mockResolvedValue([{ _id: production, slug: "production" }] as never)
    })

    const secret = (password: string) => ({ name: "database", entries: [{ key: "DATABASE_PASSWORD", values: [{ environmentId: String(production), value: password }] }] })

    it("given a secret saved, when it is committed, then the manifest lands on the default branch and the working copy is gone", async () => {
        const saved = await new GitOpsService().saveVariableMap(projectId as never, "secret", async () => ({ before: null, after: secret("first"), write: async () => "saved" }))

        expect(saved).toBe("saved")
        expect(parse(show("secrets/production/database.yaml")).stringData).toEqual({ DATABASE_PASSWORD: "first" })
        expect(log()[0]).toBe("Create secret database")
        expect(fs.readdirSync(remote.root, { recursive: true }).some(entry => String(entry).endsWith("variables.gitops"))).toBe(false)
    })

    it("given a database write that fails after the push, when the secret is updated, then the file is committed back to what the branch held", async () => {
        const failing = new GitOpsService().saveVariableMap(projectId as never, "secret", async () => ({
            before: secret("first"),
            after: secret("second"),
            write: () => Promise.reject(new Error("validation failed"))
        }))

        await expect(failing).rejects.toThrow("validation failed")
        expect(log().slice(0, 2)).toEqual(["Revert: update secret database", "Update secret database"])
        expect(parse(show("secrets/production/database.yaml")).stringData).toEqual({ DATABASE_PASSWORD: "first" })
    })

    it("given a map created by a save whose write fails, when it is reverted, then its file is removed again", async () => {
        const failing = new GitOpsService().saveVariableMap(projectId as never, "configMap", async () => ({
            before: null,
            after: { name: "orders", entries: [{ key: "LOG_LEVEL", values: [{ environmentId: String(production), value: "info" }] }] },
            write: () => Promise.reject(new Error("duplicate key"))
        }))

        await expect(failing).rejects.toThrow("duplicate key")
        expect(() => show("configMaps/production/orders.yaml")).toThrow()
    })
})
