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
const remote = vi.hoisted(() => ({ base: "", root: "" }))

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
// The remote is a local git server, not a provider host: the clone URL points there, one bare repository per name, and the size checks are skipped
vi.mock("./workspace/RepositoryWorkspaceService", async importOriginal => ({
    ...(await importOriginal<typeof import("./workspace/RepositoryWorkspaceService")>()),
    cloneUrlFor: ({ repositoryName }: { repositoryName: string }) => `${remote.base}/${repositoryName}.git`,
    default: class {
        prepare({ workingCopy }: { workingCopy: { prepare: (branch: string) => Promise<string> } }, branch: string) {
            return workingCopy.prepare(branch)
        }
    }
}))

import CodeRepository from "../models/CodeRepositoryModel"
import Environment from "../models/EnvironmentModel"
import Microfrontend from "../models/MicrofrontendModel"
import Organization from "../models/OrganizationModel"
import Project from "../models/ProjectModel"
import Service from "../models/ServiceModel"
import { ConfigMap, Secret } from "../models/VariableMapModel"
import GitOpsService from "./GitOpsService"
import { RepositoryFileService } from "./RepositoryFileService"

const projectId = new Types.ObjectId()
const production = new Types.ObjectId()
const connectionId = new Types.ObjectId()
const link = { enabled: true, codeRepositoryId: connectionId, repositoryId: "42", name: "platform-config", repositoryData: {} }
const applicationsLink = { enabled: true, codeRepositoryId: connectionId, repositoryId: "43", name: "platform-apps", repositoryData: {} }

describe.skipIf(!hasGit)("GitOpsService against a local smart HTTP remote", () => {
    let tmp: string
    let bare: string
    let applicationsBare: string
    let server: http.Server

    const show = (file: string) => run(bare, "show", `main:${file}`)
    const log = () => run(bare, "log", "--format=%s", "main").split("\n")
    const showOnBranch = (file: string) => run(applicationsBare, "show", `production:${file}`)

    /** A bare repository with a README on main, served by the git server */
    const createRemote = (name: string) => {
        const repository = path.join(tmp, "remote", `${name}.git`)
        run(tmp, "init", "--bare", "--initial-branch=main", repository)
        run(repository, "config", "http.receivepack", "true")
        const seed = path.join(tmp, `seed-${name}`)
        run(tmp, "clone", repository, seed)
        fs.writeFileSync(path.join(seed, "README.md"), `# ${name}\n`)
        run(seed, "add", ".")
        run(seed, "commit", "-m", "init")
        run(seed, "push", "origin", "main")
        return repository
    }

    beforeAll(async () => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gitops-"))
        bare = createRemote("platform-config")
        applicationsBare = createRemote("platform-apps")

        server = await startGitServer(path.join(tmp, "remote"))
        remote.base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
        remote.root = path.join(tmp, "workspaces")
    })

    afterAll(() => {
        server?.close()
        fs.rmSync(tmp, { recursive: true, force: true })
    })

    const orders = (version: string) => ({ _id: new Types.ObjectId(), slug: "orders-api", version, image: { repository: "ghcr.io/acme/orders-api" }, configMapIds: [], secretIds: [] })
    let gitOps: object

    beforeEach(() => {
        gitOps = { enabled: true, codeRepository: link }
        vi.spyOn(GitOpsService.prototype as unknown as { ensureNotViewer: () => Promise<void> }, "ensureNotViewer").mockResolvedValue(undefined)
        vi.spyOn(GitOpsService.prototype as unknown as { ensureAccessToEnvironment: () => Promise<boolean> }, "ensureAccessToEnvironment").mockResolvedValue(true)
        vi.spyOn(GitOpsService.prototype as unknown as { domainScopeFilter: () => Promise<object> }, "domainScopeFilter").mockResolvedValue({})
        vi.spyOn(RepositoryFileService.prototype, "getDefaultBranch").mockResolvedValue("main")
        vi.spyOn(Project, "findById").mockImplementation((() => Promise.resolve({ _id: projectId, slug: "shop", organizationId: new Types.ObjectId(), gitOps })) as never)
        vi.spyOn(Organization, "findById").mockResolvedValue({ _id: new Types.ObjectId(), slug: "acme" } as never)
        vi.spyOn(CodeRepository, "findOne").mockResolvedValue({ _id: connectionId, provider: "GITHUB", accessToken: "token", githubData: { organizationId: "acme" } } as never)
        vi.spyOn(Environment, "find").mockResolvedValue([{ _id: production, slug: "production", projectId }] as never)
        vi.spyOn(ConfigMap, "find").mockResolvedValue([] as never)
        vi.spyOn(Service, "find").mockResolvedValue([] as never)
        vi.spyOn(Microfrontend, "find").mockResolvedValue([] as never)
    })

    const secret = (password: string) => ({ _id: new Types.ObjectId(), name: "database", entries: [{ key: "DATABASE_PASSWORD", values: [{ environmentId: String(production), value: password }] }] })
    const base64 = (value: string) => Buffer.from(value).toString("base64")
    const withSecret = (password: string) => vi.spyOn(Secret, "find").mockResolvedValue([secret(password)] as never)
    const deployProduction = (task: () => Promise<unknown> = async () => "deployed") => new GitOpsService().deploy([production] as never, task)

    it("given production deployed, when it is committed, then the namespace and the secret land on the default branch and the working copy is gone", async () => {
        withSecret("first")

        expect(await deployProduction()).toBe("deployed")

        expect(parse(show("production/namespace.yaml"))).toMatchObject({ kind: "Namespace", metadata: { name: "production" } })
        expect(parse(show("production/secrets/database.yaml")).data).toEqual({ DATABASE_PASSWORD: base64("first") })
        expect(log()[0]).toBe("Deploy production")
        expect(fs.readdirSync(remote.root, { recursive: true }).some(entry => String(entry).endsWith("variables.gitops"))).toBe(false)
        expect(fs.readdirSync(remote.root, { recursive: true }).some(entry => String(entry).endsWith("config.gitops"))).toBe(false)
    })

    it("given a deploy that fails after the push, when the secret changed, then the commit is reverted and main holds the previous content", async () => {
        withSecret("second")

        await expect(deployProduction(() => Promise.reject(new Error("rollout failed")))).rejects.toThrow("rollout failed")

        expect(log().slice(0, 2)).toEqual(["Revert: deploy production", "Deploy production"])
        expect(parse(show("production/secrets/database.yaml")).data).toEqual({ DATABASE_PASSWORD: base64("first") })
    })

    describe("with an applications repository", () => {
        beforeEach(() => {
            gitOps = { enabled: true, codeRepository: link, applicationsCodeRepository: applicationsLink }
            withSecret("first")
        })

        it("given a service with a version and an image, when production is deployed, then the branch production gets the chart and the values of the service", async () => {
            vi.spyOn(Service, "find").mockResolvedValue([orders("1.0.0")] as never)

            await deployProduction()

            expect(parse(showOnBranch("microservice-chart/Chart.yaml")).name).toBe("microservice-chart")
            expect(parse(showOnBranch("orders-api.yaml")).image).toEqual({ host: "ghcr.io", name: "acme/orders-api", tag: "1.0.0" })
            expect(run(applicationsBare, "log", "--format=%s", "production")).toContain("Deploy production")
        })

        it("given a chart file modified on the branch, when production is deployed again, then the chart file is kept and the values are updated", async () => {
            const clone = path.join(tmp, "edit-apps")
            run(tmp, "clone", "--branch", "production", path.join(tmp, "remote", "platform-apps.git"), clone)
            fs.appendFileSync(path.join(clone, "microservice-chart", "Chart.yaml"), "# changed by the team\n")
            run(clone, "commit", "-am", "team change")
            run(clone, "push", "origin", "production")
            vi.spyOn(Service, "find").mockResolvedValue([orders("2.0.0")] as never)

            await deployProduction()

            expect(showOnBranch("microservice-chart/Chart.yaml")).toContain("# changed by the team")
            expect(parse(showOnBranch("orders-api.yaml")).image.tag).toBe("2.0.0")
        })

        it("given a deploy that fails, when the applications branch was pushed, then its values are reverted too", async () => {
            vi.spyOn(Service, "find").mockResolvedValue([orders("3.0.0")] as never)

            await expect(deployProduction(() => Promise.reject(new Error("rollout failed")))).rejects.toThrow("rollout failed")

            expect(parse(showOnBranch("orders-api.yaml")).image.tag).toBe("2.0.0")
        })
    })
})
