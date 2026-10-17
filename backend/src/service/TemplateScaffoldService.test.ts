import fs from "fs-extra"
import os from "os"
import { join } from "path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("..", () => ({
    fastify: { log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }, config: {} }
}))

/** The clone leaves a `.git` folder whose content must never be rewritten */
vi.mock("./CodeManagementService", () => ({
    default: class {
        constructor(
            _provider: string,
            _token: string,
            private dir: string
        ) {}
        async cloneRepository() {
            await fs.outputFile(join(this.dir, ".git", "config"), "url = %serviceSlug% %microfrontendSlug%")
        }
        async pushRepository() {
            // Nothing leaves the machine in a test
        }
    }
}))

/** What every file holds at the moment of the initial commit, relative path to content */
let committed: Record<string, string> = {}

const snapshot = async (dir: string, base = ""): Promise<Record<string, string>> => {
    const result: Record<string, string> = {}
    for (const item of await fs.readdir(join(dir, base))) {
        const relative = base ? `${base}/${item}` : item
        if ((await fs.lstat(join(dir, relative))).isDirectory()) {
            Object.assign(result, await snapshot(dir, relative))
        } else {
            result[relative] = await fs.readFile(join(dir, relative), "utf8")
        }
    }
    return result
}

vi.mock("isomorphic-git", () => ({
    branch: vi.fn(async () => undefined),
    add: vi.fn(async () => undefined),
    commit: vi.fn(async ({ dir }: { dir: string }) => {
        committed = await snapshot(dir)
    }),
    push: vi.fn(async () => undefined),
    listRemotes: vi.fn(async () => []),
    listBranches: vi.fn(async () => [])
}))

import { Types } from "mongoose"
import GithubClient from "../client/GithubClient"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import CodeRepository, { CodeRepositoryProvider, ICodeRepository } from "../models/CodeRepositoryModel"
import { IMarket } from "../models/MarketModel"
import Microfrontend from "../models/MicrofrontendModel"
import Service from "../models/ServiceModel"
import MicrofrontendService from "./MicrofrontendService"
import ServiceService from "./ServiceService"
import TemplateScaffoldService from "./TemplateScaffoldService"

const servicePlaceholders = { "%serviceSlug%": "orders-api", "%domain%": "https://console.example.com" }

let workDir: string

/** A template zip as the providers ship it: one top-level `<repo>-main/` folder */
const templateZip = async (files: Record<string, string | Buffer>) => {
    const dir = await fs.mkdtemp(join(workDir, "template-"))
    for (const [relative, content] of Object.entries(files)) {
        await fs.outputFile(join(dir, "template-main", relative), content)
    }
    return dir
}

const pipelinesZip = async (files: Record<string, string>) => {
    const dir = await fs.mkdtemp(join(workDir, "pipelines-"))
    for (const [relative, content] of Object.entries(files)) {
        await fs.outputFile(join(dir, "template-pipelines-main", relative), content)
    }
    return dir
}

const scaffoldWith = (template: string, pipelines: string) => {
    const service = new TemplateScaffoldService()
    vi.spyOn(service, "downloadZip").mockImplementation(async prefix => (prefix === "template" ? template : pipelines))
    return service
}

beforeEach(async () => {
    committed = {}
    workDir = await fs.mkdtemp(join(os.tmpdir(), "scaffold-test-"))
})

afterEach(async () => {
    vi.restoreAllMocks()
    await fs.remove(workDir)
})

describe("TemplateScaffoldService, service templates", () => {
    const serviceTemplate = { slug: "service-node-fastify", type: "service", compiler: "docker", framework: "Node.js", zipUrl: "https://example.com/t.zip" } as IMarket

    const serviceFiles = {
        "package.json": '{ "name": "%serviceSlug%" }',
        "src/app.ts": 'const name = "%serviceSlug%"\nconst console = "%domain%"',
        ".github/workflows/release.yml": "curl %domain%/services/by-slug/%serviceSlug%/versions/$TAG",
        ".gitlab-ci.yml": "url: %domain%/services/by-slug/%serviceSlug%",
        "azure-pipelines.yml": "url: %domain%/services/by-slug/%serviceSlug%",
        "assets/logo.bin": Buffer.from([0x25, 0x00, 0x01, 0x02])
    }

    const expectReplacedEverywhere = () => {
        expect(committed["package.json"]).toBe('{ "name": "orders-api" }')
        expect(committed["src/app.ts"]).toBe('const name = "orders-api"\nconst console = "https://console.example.com"')
        expect(committed[".github/workflows/release.yml"]).toBe("curl https://console.example.com/services/by-slug/orders-api/versions/$TAG")
        expect(committed[".gitlab-ci.yml"]).toBe("url: https://console.example.com/services/by-slug/orders-api")
        expect(committed["azure-pipelines.yml"]).toBe("url: https://console.example.com/services/by-slug/orders-api")
        expect(committed[".git/config"]).toBe("url = %serviceSlug% %microfrontendSlug%")
    }

    it("given GitHub, when a service template is scaffolded, then every text file has its placeholders replaced before the initial commit", async () => {
        const service = scaffoldWith(await templateZip(serviceFiles), await pipelinesZip({}))

        await service.injectTemplateGithub("orders-api", "token", "https://github.com/acme/orders-api.git", "github", serviceTemplate, { placeholders: servicePlaceholders })

        expectReplacedEverywhere()
    })

    it("given GitLab, when a service template is scaffolded, then every text file has its placeholders replaced before the initial commit", async () => {
        const service = scaffoldWith(await templateZip(serviceFiles), await pipelinesZip({}))
        const codeRepository = { provider: CodeRepositoryProvider.GITLAB, gitlabData: { url: "https://gitlab.com", groupPath: "acme" } } as unknown as ICodeRepository

        await service.injectTemplateGitlab("token", "https://gitlab.com", "orders-api", "acme", codeRepository, "gitlab", serviceTemplate, { placeholders: servicePlaceholders })

        expectReplacedEverywhere()
    })

    it("given Azure DevOps, when a service template is scaffolded, then every text file has its placeholders replaced before the initial commit", async () => {
        const service = scaffoldWith(await templateZip(serviceFiles), await pipelinesZip({}))
        const codeRepository = { provider: CodeRepositoryProvider.AZURE_DEV_OPS, azureData: { organization: "acme", projectId: "p" } } as unknown as ICodeRepository

        await service.injectTemplateAzureDevOps("token", "orders-api", codeRepository, "azure_dev_ops", serviceTemplate, { placeholders: servicePlaceholders })

        expectReplacedEverywhere()
    })

    it("given a binary file, when the placeholders are replaced, then it is left byte for byte", async () => {
        const template = await templateZip(serviceFiles)
        const service = scaffoldWith(template, await pipelinesZip({}))

        await service.replacePlaceholdersInDirectory(join(template, "template-main"), servicePlaceholders)

        expect(await fs.readFile(join(template, "template-main", "assets", "logo.bin"))).toEqual(serviceFiles["assets/logo.bin"])
    })
})

describe("TemplateScaffoldService, microfrontend templates", () => {
    const remoteTemplate = { slug: "vite-remote-react", type: "remote", compiler: "vite", framework: "React", zipUrl: "https://example.com/t.zip" } as IMarket

    /** The pipeline overlay is the only place a microfrontend gets its placeholders replaced, as before services existed */
    it("given GitHub, when a microfrontend template is scaffolded, then only the copied pipeline has its placeholders replaced", async () => {
        const service = scaffoldWith(
            await templateZip({ "src/index.ts": 'export const name = "%microfrontendSlug%" // %domain%' }),
            await pipelinesZip({ "remote/vite/github/workflows/deploy.yml": "slug: %microfrontendSlug%\nurl: %domain%" })
        )
        const domain = process.env.BACKEND_URL || "https://console.mfe-orchestrator.dev"

        await service.injectTemplateGithub("cart", "token", "https://github.com/acme/cart.git", "github", remoteTemplate)

        expect(committed[".github/workflows/deploy.yml"]).toBe(`slug: cart\nurl: ${domain}`)
        expect(committed["src/index.ts"]).toBe('export const name = "%microfrontendSlug%" // %domain%')
    })

    it("given GitLab, when a microfrontend template is scaffolded, then the copied pipeline is committed untouched", async () => {
        const service = scaffoldWith(await templateZip({ "src/index.ts": "%microfrontendSlug%" }), await pipelinesZip({ "remote/vite/gitlab/.gitlab-ci.yml": "slug: %microfrontendSlug%" }))
        const codeRepository = { provider: CodeRepositoryProvider.GITLAB, gitlabData: { url: "https://gitlab.com", groupPath: "acme" } } as unknown as ICodeRepository

        await service.injectTemplateGitlab("token", "https://gitlab.com", "cart", "acme", codeRepository, "gitlab", remoteTemplate)

        expect(committed[".gitlab-ci.yml"]).toBe("slug: %microfrontendSlug%")
        expect(committed["src/index.ts"]).toBe("%microfrontendSlug%")
    })
})

describe("TemplateScaffoldService.createTag", () => {
    const projectId = new Types.ObjectId()
    const otherProjectId = new Types.ObjectId()
    const codeRepositoryId = new Types.ObjectId()
    const link = { enabled: true, codeRepositoryId, repositoryId: "42", name: "orders-api" }

    let getBranchCommitSha: ReturnType<typeof vi.spyOn>
    let createTag: ReturnType<typeof vi.spyOn>

    const connectionOf = (owner: Types.ObjectId) =>
        vi
            .spyOn(CodeRepository, "findById")
            .mockResolvedValue({ _id: codeRepositoryId, projectId: owner, provider: CodeRepositoryProvider.GITHUB, accessToken: "token", githubData: { userName: "acme" } } as never)

    beforeEach(() => {
        getBranchCommitSha = vi.spyOn(GithubClient.prototype, "getBranchCommitSha").mockResolvedValue("abc123" as never)
        createTag = vi.spyOn(GithubClient.prototype, "createTag").mockResolvedValue(undefined)
    })

    it("given a connection of the same project, when a tag is created, then the provider tags the branch", async () => {
        connectionOf(projectId)

        await new TemplateScaffoldService().createTag(link as never, projectId, "1.2.0", "main")

        expect(createTag).toHaveBeenCalledWith("token", "orders-api", "1.2.0", "abc123", undefined, "acme")
    })

    /** The connection holds the access token: one of another project must not be usable through a link */
    it("given a connection of another project, when a tag is created, then it is not found and the provider is never called", async () => {
        connectionOf(otherProjectId)

        await expect(new TemplateScaffoldService().createTag(link as never, projectId, "1.2.0")).rejects.toBeInstanceOf(EntityNotFoundError)
        expect(getBranchCommitSha).not.toHaveBeenCalled()
        expect(createTag).not.toHaveBeenCalled()
    })

    it("given a microfrontend linked to a connection of another project, when it is built, then it is refused before the provider is called", async () => {
        connectionOf(otherProjectId)
        vi.spyOn(Microfrontend, "findById").mockResolvedValue({ _id: new Types.ObjectId(), projectId, slug: "cart", codeRepository: link } as never)
        vi.spyOn(MicrofrontendService.prototype as unknown as { ensureAccessToMicrofrontend: () => Promise<void> }, "ensureAccessToMicrofrontend").mockResolvedValue(undefined)

        await expect(new MicrofrontendService().build(String(new Types.ObjectId()), "1.2.0")).rejects.toBeInstanceOf(EntityNotFoundError)
        expect(createTag).not.toHaveBeenCalled()
    })

    it("given a microfrontend linked to a connection of its project, when it is built, then the tag is created", async () => {
        connectionOf(projectId)
        vi.spyOn(Microfrontend, "findById").mockResolvedValue({ _id: new Types.ObjectId(), projectId, slug: "cart", codeRepository: link } as never)
        vi.spyOn(MicrofrontendService.prototype as unknown as { ensureAccessToMicrofrontend: () => Promise<void> }, "ensureAccessToMicrofrontend").mockResolvedValue(undefined)

        await new MicrofrontendService().build(String(new Types.ObjectId()), "1.2.0")

        expect(createTag).toHaveBeenCalledTimes(1)
    })

    it("given a service linked to a connection of another project, when it is built, then it is refused before the provider is called", async () => {
        connectionOf(otherProjectId)
        vi.spyOn(Service, "findById").mockResolvedValue({ _id: new Types.ObjectId(), projectId, slug: "orders-api", codeRepository: link } as never)
        vi.spyOn(ServiceService.prototype as unknown as { ensureAccessToService: () => Promise<void> }, "ensureAccessToService").mockResolvedValue(undefined)

        await expect(new ServiceService().build(String(new Types.ObjectId()), "1.2.0")).rejects.toBeInstanceOf(EntityNotFoundError)
        expect(createTag).not.toHaveBeenCalled()
    })
})
