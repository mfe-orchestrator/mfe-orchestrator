import AdmZip from "adm-zip"
import axios from "axios"
import fs from "fs-extra"
import os from "os"
import { join } from "path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { parse as parseYaml } from "yaml"

vi.mock("..", () => ({
    fastify: { log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }, config: { REPOSITORIES_MAX_SIZE_MB: 50 } }
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
            await fs.outputFile(join(this.dir, ".git", "config"), "url = %microfrontendSlug%")
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

/** What a clone of the project's pipeline templates repository brings, relative path to content */
let remotePipelines: Record<string, string> = {}
/** The symlinks it checks out, relative path to target, as isomorphic-git does for a mode 120000 entry */
let remoteSymlinks: Record<string, string> = {}

vi.mock("isomorphic-git", () => ({
    clone: vi.fn(async ({ dir }: { dir: string }) => {
        for (const [relative, content] of Object.entries(remotePipelines)) await fs.outputFile(join(dir, relative), content)
        for (const [relative, target] of Object.entries(remoteSymlinks)) {
            await fs.ensureDir(join(dir, relative, ".."))
            await fs.symlink(target, join(dir, relative))
        }
    }),
    branch: vi.fn(async () => undefined),
    add: vi.fn(async () => undefined),
    commit: vi.fn(async ({ dir }: { dir: string }) => {
        committed = await snapshot(dir)
    }),
    push: vi.fn(async () => undefined),
    listRemotes: vi.fn(async () => []),
    listBranches: vi.fn(async () => [])
}))

import * as git from "isomorphic-git"
import { Types } from "mongoose"
import AzureDevOpsClient from "../client/AzureDevOpsClient"
import GithubClient from "../client/GithubClient"
import GitlabClient from "../client/GitlabClient"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import CodeRepository, { CodeRepositoryProvider, ICodeRepository } from "../models/CodeRepositoryModel"
import { IMarket } from "../models/MarketModel"
import Microfrontend from "../models/MicrofrontendModel"
import Project from "../models/ProjectModel"
import { MicrofrontendCompiler, MicrofrontendFramework, MicrofrontendStackSource } from "../types/MicrofrontendStack"
import MarketService from "./MarketService"
import MicrofrontendService from "./MicrofrontendService"
import TemplateScaffoldService, { PipelineTemplates, placeholderDomain, replaceFederationName } from "./TemplateScaffoldService"
import RepositoryWorkspaceService from "./workspace/RepositoryWorkspaceService"

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
    remotePipelines = {}
    remoteSymlinks = {}
    workDir = await fs.mkdtemp(join(os.tmpdir(), "scaffold-test-"))
})

afterEach(async () => {
    vi.restoreAllMocks()
    await fs.remove(workDir)
})

describe("TemplateScaffoldService.replacePlaceholdersInDirectory", () => {
    it("given a binary file, when the placeholders are replaced, then it is left byte for byte", async () => {
        const binary = Buffer.from([0x25, 0x00, 0x01, 0x02])
        const template = await templateZip({ "assets/logo.bin": binary })
        const service = scaffoldWith(template, await pipelinesZip({}))

        await service.replacePlaceholdersInDirectory(join(template, "template-main"), { "%microfrontendSlug%": "cart" })

        expect(await fs.readFile(join(template, "template-main", "assets", "logo.bin"))).toEqual(binary)
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

    it("given GitLab, when a microfrontend template is scaffolded, then only the copied pipeline has its placeholders replaced", async () => {
        const service = scaffoldWith(
            await templateZip({ "src/index.ts": "%microfrontendSlug% %domain%" }),
            await pipelinesZip({ "remote/vite/gitlab/.gitlab-ci.yml": "slug: %microfrontendSlug%\nurl: %domain%" })
        )
        const codeRepository = { provider: CodeRepositoryProvider.GITLAB, gitlabData: { url: "https://gitlab.com", groupPath: "acme" } } as unknown as ICodeRepository

        await service.injectTemplateGitlab("cart", "token", "https://gitlab.com", "cart", "acme", codeRepository, "gitlab", remoteTemplate)

        expect(committed[".gitlab-ci.yml"]).toBe(`slug: cart\nurl: ${placeholderDomain()}`)
        expect(committed["src/index.ts"]).toBe("%microfrontendSlug% %domain%")
    })

    it("given Azure DevOps, when a microfrontend template is scaffolded, then only the copied pipeline has its placeholders replaced", async () => {
        const service = scaffoldWith(
            await templateZip({ "src/index.ts": "%microfrontendSlug% %domain%" }),
            await pipelinesZip({ "remote/vite/azure_dev_ops/azure-pipelines.yml": "slug: %microfrontendSlug%\nurl: %domain%" })
        )
        const codeRepository = { provider: CodeRepositoryProvider.AZURE_DEV_OPS, azureData: { organization: "acme", projectId: "p" } } as unknown as ICodeRepository

        await service.injectTemplateAzureDevOps("cart", "token", "cart", codeRepository, "azure_dev_ops", remoteTemplate)

        expect(committed["azure-pipelines.yml"]).toBe(`slug: cart\nurl: ${placeholderDomain()}`)
        expect(committed["src/index.ts"]).toBe("%microfrontendSlug% %domain%")
    })
})

/**
 * The real pipelines of mfe-orchestrator/template-pipelines, copied under __fixtures__, scaffolded
 * on every provider: once the placeholders are in, each one has to be a pipeline the provider can
 * read and that publishes to the right microfrontend on the right console.
 */
describe("TemplateScaffoldService, pipelines of template-pipelines", () => {
    const fixtures = join(__dirname, "__fixtures__", "template-pipelines")
    const slug = "checkout-new"
    /** BACKEND_URL unset: the fallback every provider shares */
    const domain = "https://console.mfe-orchestrator.dev"

    // biome-ignore lint/suspicious/noExplicitAny: a parsed pipeline is an arbitrarily nested YAML document
    type Pipeline = Record<string, any>
    /** The variable list of an Azure DevOps stage, as name to value */
    const azureVariables = (stage: Pipeline) => Object.fromEntries((stage.variables as { name?: string; value?: string }[]).filter(v => v.name).map(v => [v.name, v.value]))
    const azureStage = (pipeline: Pipeline, name: string) => (pipeline.stages as Pipeline[]).find(stage => stage.stage === name) as Pipeline
    const azureUpload = (pipeline: Pipeline) => (azureStage(pipeline, "Deploy").jobs[0].steps as Pipeline[]).find(step => step.task === "mfe-orchestrator-upload@1")?.inputs

    const templates = [
        {
            name: "a vite remote",
            template: { slug: "vite-remote-react", type: "remote", compiler: "vite", framework: "React", zipUrl: "https://example.com/t.zip" } as IMarket,
            expectedText: [slug, domain],
            gitlab: (pipeline: Pipeline) => {
                expect(pipeline.deploy.variables).toEqual({ MICROFRONTEND_SLUG: slug, MICROFRONTEND_ORCHESTRATOR_DOMAIN: domain })
                // The upload route the console API exposes behind nginx's /api/ prefix
                expect(pipeline.deploy.script.join("\n")).toContain("${MICROFRONTEND_ORCHESTRATOR_DOMAIN%/}/api/microfrontends/by-slug/${MICROFRONTEND_SLUG}/upload/${CI_COMMIT_TAG}")
            },
            azure: (pipeline: Pipeline) => {
                expect(azureVariables(azureStage(pipeline, "Deploy")).MICROFRONTEND_ORCHESTRATOR_DOMAIN_RESOLVED).toBe(`$[coalesce(variables['MICROFRONTEND_ORCHESTRATOR_DOMAIN'], '${domain}')]`)
                expect(azureUpload(pipeline)).toMatchObject({ microfrontendSlug: slug, domain: "$(MICROFRONTEND_ORCHESTRATOR_DOMAIN_RESOLVED)" })
            },
            github: (pipeline: Pipeline) => {
                const upload = (pipeline.jobs["build-and-deploy"].steps as Pipeline[]).find(step => String(step.uses).startsWith("mfe-orchestrator-hub/github-action"))?.with
                expect(upload).toMatchObject({ "microfrontend-slug": slug, domain: `\${{ vars.MICROFRONTEND_ORCHESTRATOR_DOMAIN || '${domain}' }}` })
            }
        },
        {
            name: "a single-spa host",
            template: { slug: "single-spa-host-react", type: "host", compiler: "single-spa", framework: "React", zipUrl: "https://example.com/t.zip" } as IMarket,
            // A host publishes nothing: it only builds against the console API
            expectedText: [`${domain}/api`],
            gitlab: (pipeline: Pipeline) => {
                expect(pipeline.build.variables).toEqual({ VITE_MFE_BACKEND_URL: `${domain}/api` })
            },
            azure: (pipeline: Pipeline) => {
                expect(azureVariables(pipeline).VITE_MFE_BACKEND_URL_RESOLVED).toBe(`$[coalesce(variables['VITE_MFE_BACKEND_URL'], '${domain}/api')]`)
            },
            github: (pipeline: Pipeline) => {
                const build = (pipeline.jobs["build-and-deploy"].steps as Pipeline[]).find(step => step.run === "pnpm build")
                expect(build?.env.VITE_MFE_BACKEND_URL).toBe(`\${{ vars.VITE_MFE_BACKEND_URL || '${domain}/api' }}`)
            }
        }
    ]

    const providers = [
        {
            folder: "gitlab",
            pipeline: ".gitlab-ci.yml",
            check: "gitlab" as const,
            scaffold: (service: TemplateScaffoldService, template: IMarket) =>
                service.injectTemplateGitlab(
                    slug,
                    "token",
                    "https://gitlab.com",
                    slug,
                    "acme",
                    { provider: CodeRepositoryProvider.GITLAB, gitlabData: { url: "https://gitlab.com", groupPath: "acme" } } as unknown as ICodeRepository,
                    "gitlab",
                    template
                )
        },
        {
            folder: "azure_dev_ops",
            pipeline: "azure-pipelines.yml",
            check: "azure" as const,
            scaffold: (service: TemplateScaffoldService, template: IMarket) =>
                service.injectTemplateAzureDevOps(
                    slug,
                    "token",
                    slug,
                    { provider: CodeRepositoryProvider.AZURE_DEV_OPS, azureData: { organization: "acme", projectId: "p" } } as unknown as ICodeRepository,
                    "azure_dev_ops",
                    template
                )
        },
        {
            folder: "github",
            pipeline: ".github/workflows/build-and-deploy.yml",
            check: "github" as const,
            scaffold: (service: TemplateScaffoldService, template: IMarket) => service.injectTemplateGithub(slug, "token", `https://github.com/acme/${slug}.git`, "github", template)
        }
    ]

    const cases = templates.flatMap(template => providers.map(provider => ({ ...template, ...provider })))

    beforeEach(() => {
        vi.stubEnv("BACKEND_URL", "")
    })

    afterEach(() => {
        vi.unstubAllEnvs()
    })

    it.each(cases)("given $name on $folder, when it is scaffolded, then its pipeline has no placeholder left, points at the console and parses as YAML", async testCase => {
        const pipelines = await fs.mkdtemp(join(workDir, "pipelines-"))
        await fs.copy(fixtures, join(pipelines, "template-pipelines-main"))
        const source = await fs.readFile(
            join(
                fixtures,
                testCase.template.type as string,
                testCase.template.compiler as string,
                testCase.folder,
                testCase.folder === "github" ? "workflows/build-and-deploy.yml" : testCase.pipeline
            ),
            "utf8"
        )
        const service = scaffoldWith(await templateZip({ "package.json": '{ "name": "%microfrontendSlug%" }' }), pipelines)

        await testCase.scaffold(service, testCase.template)

        const committedPipeline = committed[testCase.pipeline]
        expect(source).toMatch(/%(microfrontendSlug|domain)%/)
        expect(committedPipeline).not.toMatch(/%[A-Za-z_]+%/)
        for (const text of testCase.expectedText) expect(committedPipeline).toContain(text)
        testCase[testCase.check](parseYaml(committedPipeline) as Pipeline)
        // A microfrontend gets its placeholders replaced in the pipeline only, never in its own files
        expect(committed["package.json"]).toBe('{ "name": "%microfrontendSlug%" }')
    })
})

/**
 * Where the copied pipeline comes from: the first of `<type>/<compiler>/<template slug>/<provider>` and
 * `<type>/<compiler>/<provider>` found, in the official template-pipelines or in the repository the project
 * picked, which wins over the official one and never falls back to it.
 */
describe("TemplateScaffoldService, pipeline templates", () => {
    const providersConnection = {
        gitlab: { provider: CodeRepositoryProvider.GITLAB, gitlabData: { url: "https://gitlab.com", groupPath: "acme" } } as unknown as ICodeRepository
    }
    const remoteTemplate = { slug: "vite-remote-react", type: "remote", compiler: "vite", framework: "React", zipUrl: "https://example.com/t.zip" } as IMarket
    const remoteFiles = {
        "package.json": '{ "name": "cart" }',
        ".github/workflows/release.yml": "own: release",
        ".github/dependabot.yml": "version: 2",
        ".gitlab-ci.yml": "own: gitlab",
        "azure-pipelines.yml": "own: azure"
    }

    const providers = [
        {
            folder: "github",
            source: "workflows/build.yml",
            committed: ".github/workflows/build.yml",
            own: ".github/workflows/release.yml",
            scaffold: (service: TemplateScaffoldService) => service.injectTemplateGithub("cart", "token", "https://github.com/acme/cart.git", "github", remoteTemplate)
        },
        {
            folder: "gitlab",
            source: ".gitlab-ci.yml",
            committed: ".gitlab-ci.yml",
            own: ".gitlab-ci.yml",
            scaffold: (service: TemplateScaffoldService) =>
                service.injectTemplateGitlab(
                    "cart",
                    "token",
                    "https://gitlab.com",
                    "cart",
                    "acme",
                    { provider: CodeRepositoryProvider.GITLAB, gitlabData: { url: "https://gitlab.com", groupPath: "acme" } } as unknown as ICodeRepository,
                    "gitlab",
                    remoteTemplate
                )
        },
        {
            folder: "azure_dev_ops",
            source: "azure-pipelines.yml",
            committed: "azure-pipelines.yml",
            own: "azure-pipelines.yml",
            scaffold: (service: TemplateScaffoldService) =>
                service.injectTemplateAzureDevOps(
                    "cart",
                    "token",
                    "cart",
                    { provider: CodeRepositoryProvider.AZURE_DEV_OPS, azureData: { organization: "acme", projectId: "p" } } as unknown as ICodeRepository,
                    "azure_dev_ops",
                    remoteTemplate
                )
        }
    ]

    it.each(providers)("given a folder for the template and a generic one on $folder, when it is scaffolded, then the one of the template wins", async provider => {
        const service = scaffoldWith(
            await templateZip(remoteFiles),
            await pipelinesZip({
                [`remote/vite/vite-remote-react/${provider.folder}/${provider.source}`]: "from: template %microfrontendSlug% %domain%",
                [`remote/vite/${provider.folder}/${provider.source}`]: "from: generic"
            })
        )

        await provider.scaffold(service)

        expect(committed[provider.committed]).toBe(`from: template cart ${placeholderDomain()}`)
    })

    it.each(providers)("given only a generic folder on $folder, when it is scaffolded, then it is copied", async provider => {
        const service = scaffoldWith(await templateZip(remoteFiles), await pipelinesZip({ [`remote/vite/${provider.folder}/${provider.source}`]: "from: generic" }))

        await provider.scaffold(service)

        expect(committed[provider.committed]).toBe("from: generic")
    })

    it.each(providers)("given no folder for the template on $folder, when it is scaffolded, then it keeps its own pipeline", async provider => {
        const service = scaffoldWith(await templateZip(remoteFiles), await pipelinesZip({ "host/vite/github/workflows/build.yml": "from: another type" }))

        await provider.scaffold(service)

        expect(committed[provider.own]).toBe(remoteFiles[provider.own as keyof typeof remoteFiles])
    })

    /** Two release workflows named differently would both run on every tag */
    it("given a GitHub pipeline, when it is copied, then the workflows of the template go and the rest of its .github stays", async () => {
        const service = scaffoldWith(await templateZip(remoteFiles), await pipelinesZip({ "remote/vite/github/workflows/build.yml": "from: generic" }))

        await providers[0].scaffold(service)

        expect(committed[".github/workflows/build.yml"]).toBe("from: generic")
        expect(committed[".github/workflows/release.yml"]).toBeUndefined()
        expect(committed[".github/dependabot.yml"]).toBe("version: 2")
    })

    /** Wiping the workflows of the template for nothing would leave the repository with no CI */
    it("given a GitHub folder of the template with no workflow, when it is scaffolded, then it does not count and the generic one is copied", async () => {
        const pipelines = await pipelinesZip({ "remote/vite/vite-remote-react/github/dependabot.yml": "version: 3", "remote/vite/github/workflows/build.yml": "from: generic" })
        await fs.ensureDir(join(pipelines, "template-pipelines-main", "remote/vite/vite-remote-react/github/workflows"))
        const service = scaffoldWith(await templateZip(remoteFiles), pipelines)

        await providers[0].scaffold(service)

        expect(committed[".github/workflows/build.yml"]).toBe("from: generic")
        expect(committed[".github/dependabot.yml"]).toBe("version: 2")
    })

    it("given a GitHub folder with no file under workflows, when it is scaffolded, then the template keeps its workflows", async () => {
        const pipelines = await pipelinesZip({ "remote/vite/github/dependabot.yml": "version: 3" })
        await fs.ensureDir(join(pipelines, "template-pipelines-main", "remote/vite/github/workflows"))
        const service = scaffoldWith(await templateZip(remoteFiles), pipelines)

        await providers[0].scaffold(service)

        expect(committed[".github/workflows/release.yml"]).toBe("own: release")
        expect(committed[".github/dependabot.yml"]).toBe("version: 2")
    })

    it("given an official download that fails, when the pipeline is copied, then it is refused as a source that cannot be read", async () => {
        const service = new TemplateScaffoldService()
        const template = await templateZip(remoteFiles)
        vi.spyOn(service, "downloadZip").mockImplementation(async prefix => {
            if (prefix === "template") return template
            throw new Error("Request failed with status code 503")
        })

        await expect(providers[1].scaffold(service)).rejects.toMatchObject({ code: "PIPELINE_SOURCE_UNAVAILABLE", details: { repository: "template-pipelines" } })
    })

    it("given a scaffold, when the repository is pushed, then the template and the official pipelines downloaded for it are deleted", async () => {
        const template = await templateZip(remoteFiles)
        const pipelines = await pipelinesZip({ "remote/vite/gitlab/.gitlab-ci.yml": "from: generic" })
        const service = scaffoldWith(template, pipelines)

        await providers[1].scaffold(service)

        expect(committed[".gitlab-ci.yml"]).toBe("from: generic")
        expect(await fs.pathExists(template)).toBe(false)
        expect(await fs.pathExists(pipelines)).toBe(false)
    })

    describe("holding symlinks", () => {
        let outside: string
        let source: PipelineTemplates

        /** Pipelines handed in as fetched, so that the copy itself is what is checked, not the cleanup of the fetch */
        const sourceWith = async (files: Record<string, string>, links: Record<string, string>) => {
            const dir = await fs.mkdtemp(join(workDir, "source-"))
            for (const [relative, content] of Object.entries(files)) await fs.outputFile(join(dir, relative), content)
            for (const [relative, target] of Object.entries(links)) {
                await fs.ensureDir(join(dir, relative, ".."))
                await fs.symlink(target, join(dir, relative))
            }
            return { root: dir, dir, source: "test" }
        }

        beforeEach(async () => {
            outside = await fs.mkdtemp(join(workDir, "server-"))
            await fs.outputFile(join(outside, "token"), "server secret")
            await fs.outputFile(join(outside, "github", "workflows", "leak.yml"), "server secret")
        })

        it("given a pipeline file that is a symlink, when it is copied, then nothing of the server is and the template keeps its own", async () => {
            source = await sourceWith({}, { "remote/vite/gitlab/.gitlab-ci.yml": join(outside, "token") })
            const service = scaffoldWith(await templateZip(remoteFiles), await pipelinesZip({}))

            await service.injectTemplateGitlab("cart", "token", "https://gitlab.com", "cart", "acme", providersConnection.gitlab, "gitlab", remoteTemplate, undefined, source)

            expect(committed[".gitlab-ci.yml"]).toBe("own: gitlab")
        })

        it("given a template folder that is a symlink out of the source, when it is copied, then the generic folder is used instead", async () => {
            source = await sourceWith({ "remote/vite/github/workflows/build.yml": "from: generic" }, { "remote/vite/vite-remote-react": outside })
            const service = scaffoldWith(await templateZip(remoteFiles), await pipelinesZip({}))

            await service.injectTemplateGithub("cart", "token", "https://github.com/acme/cart.git", "github", remoteTemplate, undefined, source)

            expect(committed[".github/workflows/build.yml"]).toBe("from: generic")
            expect(Object.values(committed)).not.toContain("server secret")
        })

        it("given a symlink among the GitHub workflows, when they are copied, then it is left out", async () => {
            source = await sourceWith({ "remote/vite/github/workflows/build.yml": "from: generic" }, { "remote/vite/github/workflows/leak.yml": join(outside, "token") })
            const service = scaffoldWith(await templateZip(remoteFiles), await pipelinesZip({}))

            await service.injectTemplateGithub("cart", "token", "https://github.com/acme/cart.git", "github", remoteTemplate, undefined, source)

            expect(committed[".github/workflows/build.yml"]).toBe("from: generic")
            expect(committed[".github/workflows/leak.yml"]).toBeUndefined()
        })

        it("given a template type that climbs out of the source, when it is scaffolded, then nothing is looked up", async () => {
            // `<root>/../gitlab/.gitlab-ci.yml` is what type ".." and compiler "." would reach
            const parent = await sourceWith({ "gitlab/.gitlab-ci.yml": "server secret", "root/remote/vite/gitlab/.gitlab-ci.yml": "from: generic" }, {})
            source = { ...parent, root: join(parent.root, "root") }
            const service = scaffoldWith(await templateZip(remoteFiles), await pipelinesZip({}))
            const climbing = { ...remoteTemplate, type: "..", compiler: "." } as IMarket

            await service.injectTemplateGitlab("cart", "token", "https://gitlab.com", "cart", "acme", providersConnection.gitlab, "gitlab", climbing, undefined, source)

            expect(committed[".gitlab-ci.yml"]).toBe("own: gitlab")
        })
    })

    describe("of the project", () => {
        const projectId = new Types.ObjectId()
        const connectionId = new Types.ObjectId()
        const connection = { _id: connectionId, projectId, provider: CodeRepositoryProvider.GITHUB, accessToken: "token", githubData: { userName: "acme" } }
        const link = { enabled: true, codeRepositoryId: connectionId, repositoryId: "7", name: "acme-pipelines", repositoryData: {}, cloneUrlHttps: "https://github.com/acme/acme-pipelines.git" }
        const target = () => ({ enabled: true, codeRepositoryId: String(connectionId), repositoryId: "", createData: { name: "cart" } })

        let createAtGithub: ReturnType<typeof vi.spyOn>
        let findConnection: ReturnType<typeof vi.spyOn>
        let downloads: string[]

        const scaffold = async (official: Record<string, string> = {}) => {
            const template = await templateZip(remoteFiles)
            const pipelines = await pipelinesZip(official)
            downloads = []
            vi.spyOn(TemplateScaffoldService.prototype, "downloadZip").mockImplementation(async prefix => {
                downloads.push(prefix)
                return prefix === "template" ? template : pipelines
            })
            return new TemplateScaffoldService().createRepository(connection as unknown as ICodeRepository, target() as never, "cart", remoteTemplate)
        }

        let providerSize: ReturnType<typeof vi.spyOn>

        beforeEach(() => {
            providerSize = vi.spyOn(RepositoryWorkspaceService.prototype, "providerSizeBytes").mockResolvedValue(1024)
            vi.spyOn(Project, "findById").mockResolvedValue({ _id: projectId, pipelines: { codeRepository: link, ref: "v2" } } as never)
            findConnection = vi.spyOn(CodeRepository, "findOne").mockResolvedValue(connection as never)
            createAtGithub = vi.spyOn(GithubClient.prototype, "createRepository").mockResolvedValue({
                id: 1,
                name: "cart",
                clone_url: "https://github.com/acme/cart.git",
                ssh_url: "git@github.com:acme/cart.git"
            } as never)
            vi.spyOn(GithubClient.prototype, "checkRepositorySecretExists").mockResolvedValue(true)
        })

        it("given a repository of the project, when a microfrontend is scaffolded, then its pipeline is copied in place of the official one, read at the ref through the connection", async () => {
            remotePipelines = { "remote/vite/github/workflows/build.yml": "from: project %microfrontendSlug%" }

            await scaffold({ "remote/vite/github/workflows/build.yml": "from: official" })

            expect(committed[".github/workflows/build.yml"]).toBe("from: project cart")
            expect(downloads).toEqual(["template"])
            expect(findConnection).toHaveBeenCalledWith({ _id: connectionId, projectId, isActive: true })
            const clone = vi.mocked(git.clone).mock.calls.at(-1)![0]
            expect(clone).toMatchObject({ url: "https://github.com/acme/acme-pipelines.git", ref: "v2", singleBranch: true, depth: 1 })
            expect(clone.onAuth?.("", {})).toEqual({ username: "x-access-token", password: "token" })
            // The clone goes once the repository is pushed
            expect(await fs.pathExists(clone.dir)).toBe(false)
        })

        it("given a repository of the project without the folder of the template, when it is scaffolded, then the template keeps its own pipeline rather than the official one", async () => {
            remotePipelines = { "host/vite/github/workflows/build.yml": "from: project" }

            await scaffold({ "remote/vite/github/workflows/build.yml": "from: official" })

            expect(committed[".github/workflows/release.yml"]).toBe("own: release")
            expect(committed[".github/workflows/build.yml"]).toBeUndefined()
        })

        it("given a repository of the project that cannot be cloned, when it is scaffolded, then it is refused before the repository is created at the provider", async () => {
            vi.mocked(git.clone).mockRejectedValueOnce(new Error("Could not find v2."))

            await expect(scaffold()).rejects.toMatchObject({ code: "PIPELINE_SOURCE_UNAVAILABLE", statusCode: 502, details: { repository: "acme-pipelines", reason: "Could not find v2." } })
            expect(createAtGithub).not.toHaveBeenCalled()
        })

        it("given a repository of the project holding symlinks, when it is fetched, then every one of them is gone before anything is copied", async () => {
            remotePipelines = { "remote/vite/github/workflows/build.yml": "from: project" }
            remoteSymlinks = { "remote/vite/gitlab/.gitlab-ci.yml": "/etc/hosts", "remote/vite/other": "/etc" }

            const fetched = await new TemplateScaffoldService().fetchPipelineTemplates(connection as unknown as ICodeRepository)

            try {
                expect(await fs.pathExists(join(fetched.root, "remote/vite/github/workflows/build.yml"))).toBe(true)
                await expect(fs.lstat(join(fetched.root, "remote/vite/gitlab/.gitlab-ci.yml"))).rejects.toMatchObject({ code: "ENOENT" })
                await expect(fs.lstat(join(fetched.root, "remote/vite/other"))).rejects.toMatchObject({ code: "ENOENT" })
            } finally {
                await fs.remove(fetched.dir)
            }
        })

        it("given a repository of the project bigger than the limit, when it is scaffolded, then it is refused before it is cloned", async () => {
            providerSize.mockResolvedValue(51 * 1024 * 1024)
            vi.mocked(git.clone).mockClear()

            await expect(scaffold()).rejects.toMatchObject({ code: "PIPELINE_SOURCE_UNAVAILABLE", details: { reason: "it is bigger than 50 MB" } })
            expect(git.clone).not.toHaveBeenCalled()
            expect(createAtGithub).not.toHaveBeenCalled()
        })

        it("given a connection that is no longer one of the project, when it is scaffolded, then it is refused without cloning and before anything is created", async () => {
            findConnection.mockResolvedValue(null as never)
            vi.mocked(git.clone).mockClear()

            await expect(scaffold()).rejects.toMatchObject({ code: "PIPELINE_SOURCE_UNAVAILABLE" })
            expect(git.clone).not.toHaveBeenCalled()
            expect(createAtGithub).not.toHaveBeenCalled()
        })
    })
})

describe("replaceFederationName", () => {
    it("given a line with the marker, when the name is replaced, then its string literal becomes the name and keeps its quotes", () => {
        expect(replaceFederationName("      name: 'exampleremote', // mfe-orchestrator:federation-name", "checkoutnew")).toBe("      name: 'checkoutnew', // mfe-orchestrator:federation-name")
        expect(replaceFederationName('  name: "exampleremote", // mfe-orchestrator:federation-name', "checkoutnew")).toBe('  name: "checkoutnew", // mfe-orchestrator:federation-name')
    })

    it("given lines without the marker, when the name is replaced, then they are left alone", () => {
        const config = "filename: 'remoteEntry.js',\nname: 'exampleremote',\n  './Button': './src/components/Button',"

        expect(replaceFederationName(config, "checkoutnew")).toBe(config)
    })

    it("given a marked line with a second string, when the name is replaced, then only the first literal changes", () => {
        expect(replaceFederationName("name: 'exampleremote', filename: 'remoteEntry.js', // mfe-orchestrator:federation-name", "cart")).toBe(
            "name: 'cart', filename: 'remoteEntry.js', // mfe-orchestrator:federation-name"
        )
    })
})

describe("TemplateScaffoldService, federation name of a webpack microfrontend template", () => {
    const webpackRemote = { slug: "webpack-remote-react", type: "remote", compiler: "webpack", framework: "React", zipUrl: "https://example.com/t.zip" } as IMarket

    const webpackConfig = (name: string) => `new ModuleFederationPlugin({
      name: '${name}', // mfe-orchestrator:federation-name
      filename: 'remoteEntry.js',
      exposes: { './Button': './src/components/Button' },
    })`

    const remoteFiles = {
        "webpack.config.ts": webpackConfig("exampleremote"),
        "src/index.ts": "export const name = 'exampleremote' // mfe-orchestrator:federation-name",
        "vite.config.ts": "federation({ name: 'exampleremote', // mfe-orchestrator:federation-name"
    }

    /** A host configured by the console asks for federationName("checkout-new"): the dash has to go */
    const expectRenamed = () => {
        expect(committed["webpack.config.ts"]).toBe(webpackConfig("checkoutnew"))
        expect(committed["src/index.ts"]).toBe(remoteFiles["src/index.ts"])
        expect(committed["vite.config.ts"]).toBe(remoteFiles["vite.config.ts"])
    }

    it("given GitHub, when a webpack remote is scaffolded, then its container is named federationName(slug) and the pipeline still gets its placeholders", async () => {
        const service = scaffoldWith(await templateZip(remoteFiles), await pipelinesZip({ "remote/webpack/github/workflows/deploy.yml": "slug: %microfrontendSlug%" }))

        await service.injectTemplateGithub("checkout-new", "token", "https://github.com/acme/checkout-new.git", "github", webpackRemote, { microfrontendSlug: "checkout-new" })

        expectRenamed()
        expect(committed[".github/workflows/deploy.yml"]).toBe("slug: checkout-new")
    })

    it("given GitLab, when a webpack remote is scaffolded, then its container is named federationName(slug)", async () => {
        const service = scaffoldWith(await templateZip(remoteFiles), await pipelinesZip({}))
        const codeRepository = { provider: CodeRepositoryProvider.GITLAB, gitlabData: { url: "https://gitlab.com", groupPath: "acme" } } as unknown as ICodeRepository

        await service.injectTemplateGitlab("checkout-new", "token", "https://gitlab.com", "checkout-new", "acme", codeRepository, "gitlab", webpackRemote, { microfrontendSlug: "checkout-new" })

        expectRenamed()
    })

    it("given Azure DevOps, when a webpack remote is scaffolded, then its container is named federationName(slug)", async () => {
        const service = scaffoldWith(await templateZip(remoteFiles), await pipelinesZip({}))
        const codeRepository = { provider: CodeRepositoryProvider.AZURE_DEV_OPS, azureData: { organization: "acme", projectId: "p" } } as unknown as ICodeRepository

        await service.injectTemplateAzureDevOps("checkout-new", "token", "checkout-new", codeRepository, "azure_dev_ops", webpackRemote, { microfrontendSlug: "checkout-new" })

        expectRenamed()
    })

    it.each(["webpack.config.js", "webpack.config.mjs", "webpack.config.cjs"])("given a %s, when a webpack remote is scaffolded, then it is renamed too", async file => {
        const service = scaffoldWith(await templateZip({ [file]: webpackConfig("exampleremote") }), await pipelinesZip({}))

        await service.injectTemplateGithub("shop/cart", "token", "https://github.com/acme/cart.git", "github", webpackRemote, { microfrontendSlug: "shop/cart" })

        expect(committed[file]).toBe(webpackConfig("shop_cart"))
    })

    it("given no microfrontend slug, when a template is scaffolded, then its webpack config is committed untouched", async () => {
        const service = scaffoldWith(await templateZip(remoteFiles), await pipelinesZip({}))

        await service.injectTemplateGithub("checkout-new", "token", "https://github.com/acme/checkout-new.git", "github", webpackRemote)

        expect(committed["webpack.config.ts"]).toBe(remoteFiles["webpack.config.ts"])
    })
})

/**
 * The four single-spa and micro-lc templates as the marketplace declares them, scaffolded through
 * the real path a microfrontend takes: MicrofrontendService.create, the provider, the pipeline
 * overlay, the initial commit. Only the network (provider APIs, zip downloads, git push) is mocked.
 */
describe("TemplateScaffoldService, single-spa and micro-lc templates through MicrofrontendService.create", () => {
    const templates = [
        { slug: "single-spa-host-react", type: "host", compiler: "single-spa", stack: MicrofrontendCompiler.SINGLE_SPA, entryPoint: undefined },
        { slug: "single-spa-remote-react", type: "remote", compiler: "single-spa", stack: MicrofrontendCompiler.SINGLE_SPA, entryPoint: "index.js" },
        { slug: "microlc-host-react", type: "host", compiler: "micro-lc", stack: MicrofrontendCompiler.MICRO_LC, entryPoint: undefined },
        { slug: "microlc-remote-react", type: "remote", compiler: "micro-lc", stack: MicrofrontendCompiler.MICRO_LC, entryPoint: "parcel.js" }
    ]

    /** One pipeline per folder, each saying where it comes from, so the copied one is identifiable */
    const pipelineFiles = () => {
        const files: Record<string, string> = {}
        for (const type of ["host", "remote"]) {
            for (const compiler of ["generic", "vite", "webpack", "single-spa", "micro-lc"]) {
                files[`${type}/${compiler}/github/workflows/build-and-deploy.yml`] = `from: ${type}/${compiler}/github\nslug: %microfrontendSlug%\ndomain: %domain%`
                files[`${type}/${compiler}/github/dependabot.yml`] = "version: 2"
                files[`${type}/${compiler}/gitlab/.gitlab-ci.yml`] = `from: ${type}/${compiler}/gitlab\nslug: %microfrontendSlug%`
                files[`${type}/${compiler}/azure_dev_ops/azure-pipelines.yml`] = `from: ${type}/${compiler}/azure_dev_ops\nslug: %microfrontendSlug%`
            }
        }
        return files
    }

    const providers = [
        {
            provider: CodeRepositoryProvider.GITHUB,
            pipeline: ".github/workflows/build-and-deploy.yml",
            folder: "github",
            connection: { githubData: { userName: "acme" } },
            stub: () => {
                vi.spyOn(GithubClient.prototype, "createRepository").mockResolvedValue({
                    id: 1,
                    name: "cart",
                    clone_url: "https://github.com/acme/cart.git",
                    ssh_url: "git@github.com:acme/cart.git"
                } as never)
                // The deploy secret is already there: no API key is minted in a test
                vi.spyOn(GithubClient.prototype, "checkRepositorySecretExists").mockResolvedValue(true)
            }
        },
        {
            provider: CodeRepositoryProvider.GITLAB,
            pipeline: ".gitlab-ci.yml",
            folder: "gitlab",
            connection: { gitlabData: { url: "https://gitlab.com", groupPath: "acme" } },
            stub: () => {
                vi.spyOn(GitlabClient.prototype, "createRepository").mockResolvedValue({
                    id: 2,
                    name: "cart",
                    path_with_namespace: "acme/cart",
                    http_url_to_repo: "https://gitlab.com/acme/cart.git",
                    ssh_url_to_repo: "git@gitlab.com:acme/cart.git"
                } as never)
            }
        },
        {
            provider: CodeRepositoryProvider.AZURE_DEV_OPS,
            pipeline: "azure-pipelines.yml",
            folder: "azure_dev_ops",
            connection: { azureData: { organization: "acme", projectId: "p" } },
            stub: () => {
                vi.spyOn(AzureDevOpsClient.prototype, "createRepository").mockResolvedValue({
                    id: "r3",
                    name: "cart",
                    remoteUrl: "https://dev.azure.com/acme/p/_git/cart",
                    sshUrl: "git@ssh.dev.azure.com:v3/acme/p/cart"
                } as never)
                vi.spyOn(AzureDevOpsClient.prototype, "getRepository").mockResolvedValue({ id: "r3" } as never)
                vi.spyOn(AzureDevOpsClient.prototype, "createPipeline").mockResolvedValue({
                    id: 9,
                    name: "cart",
                    _links: { web: { href: "https://dev.azure.com/acme/p/_build?definitionId=9" } }
                } as never)
            }
        }
    ]

    const cases = templates.flatMap(template => providers.map(provider => ({ ...template, ...provider, name: `${template.slug} on ${provider.folder}` })))

    it.each(cases)("given $name, when a microfrontend is created from it, then the $type/$compiler pipeline is copied and the stack and entry point come from the template", async testCase => {
        const projectId = new Types.ObjectId()
        const marketEntry = {
            slug: testCase.slug,
            type: testCase.type,
            compiler: testCase.compiler,
            framework: "React",
            zipUrl: `https://github.com/mfe-orchestrator/template-${testCase.slug}/archive/refs/heads/main.zip`,
            ...(testCase.entryPoint ? { entryPoint: testCase.entryPoint } : {})
        }
        const template = await templateZip({ "package.json": '{ "name": "example" }', "vite.config.ts": "export default {}" })
        const pipelines = await pipelinesZip(pipelineFiles())
        vi.spyOn(TemplateScaffoldService.prototype, "downloadZip").mockImplementation(async prefix => (prefix === "template" ? template : pipelines))
        vi.spyOn(MarketService.prototype, "getSingle").mockResolvedValue(marketEntry as IMarket)
        vi.spyOn(CodeRepository, "findById").mockResolvedValue({ _id: new Types.ObjectId(), projectId, provider: testCase.provider, accessToken: "token", ...testCase.connection } as never)
        // No pipeline templates of its own: the official ones
        vi.spyOn(Project, "findById").mockResolvedValue({ _id: projectId } as never)
        testCase.stub()
        // The slug is free: checked before any repository is created
        vi.spyOn(Microfrontend, "exists").mockResolvedValue(null as never)
        const write = vi.spyOn(Microfrontend, "create").mockImplementation((async (doc: unknown) => doc) as never)
        const service = new MicrofrontendService()
        vi.spyOn(service as unknown as { ensureAccessToProject: () => Promise<void> }, "ensureAccessToProject").mockResolvedValue()

        await service.create(
            {
                name: "Cart",
                slug: "cart",
                version: "1.0.0",
                host: { type: "MFE_ORCHESTRATOR_HUB" },
                codeRepository: { enabled: true, codeRepositoryId: new Types.ObjectId().toString(), repositoryId: "", createData: { name: "cart", template: testCase.slug } }
            } as never,
            projectId.toString()
        )

        expect(committed[testCase.pipeline]?.split("\n")[0]).toBe(`from: ${testCase.type}/${testCase.compiler}/${testCase.folder}`)
        expect(committed["package.json"]).toBe('{ "name": "example" }')
        // The pipeline overlay is the one place a microfrontend gets its placeholders replaced, on every provider
        expect(committed[testCase.pipeline]).toContain("slug: cart")

        const stored = write.mock.calls[0][0] as unknown as { template: string; stack: object; host: { entryPoint?: string } }
        expect(stored.template).toBe(testCase.slug)
        expect(stored.stack).toEqual({ framework: MicrofrontendFramework.REACT, compiler: testCase.stack, source: MicrofrontendStackSource.TEMPLATE })
        expect(stored.host.entryPoint).toBe(testCase.entryPoint)
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
})

describe("TemplateScaffoldService.downloadZip", () => {
    it("given two downloads in the same millisecond, when they are extracted, then each one gets a folder of its own", async () => {
        const archive = new AdmZip()
        archive.addFile("template-main/a.txt", Buffer.from("a"))
        vi.spyOn(axios, "get").mockResolvedValue({ status: 200, data: archive.toBuffer() })
        vi.spyOn(Date, "now").mockReturnValue(1)
        const service = new TemplateScaffoldService()

        const [first, second] = await Promise.all([service.downloadZip("template", "u"), service.downloadZip("template", "u")])

        try {
            expect(first).not.toBe(second)
        } finally {
            await Promise.all([fs.remove(first), fs.remove(second)])
        }
    })

    it("Given a template with an executable file, when it is extracted, then the file stays executable", async () => {
        const archive = new AdmZip()
        archive.addFile("template-main/mvnw", Buffer.from("#!/bin/sh\n"), "", 0o755)
        archive.addFile("template-main/pom.xml", Buffer.from("<project/>"), "", 0o644)
        vi.spyOn(axios, "get").mockResolvedValue({ status: 200, data: archive.toBuffer() })

        const directory = await new TemplateScaffoldService().downloadZip("template", "https://example.com/template.zip")

        try {
            expect((await fs.stat(join(directory, "template-main", "mvnw"))).mode & 0o111).not.toBe(0)
            expect((await fs.stat(join(directory, "template-main", "pom.xml"))).mode & 0o111).toBe(0)
        } finally {
            await fs.remove(directory)
        }
    })
})

describe("TemplateScaffoldService.createRepository with a name in use", () => {
    afterEach(() => vi.restoreAllMocks())

    const target = () => ({ enabled: true, codeRepositoryId: String(new Types.ObjectId()), repositoryId: "", createData: { name: "checkout-fe" } })
    const github = { _id: new Types.ObjectId(), provider: CodeRepositoryProvider.GITHUB, accessToken: "token" } as unknown as ICodeRepository
    const refusal = (status: number, data: unknown) => new axios.AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, { status, data } as never)

    it("given a name the provider already has, when the repository is created, then it is refused with a code of its own", async () => {
        vi.spyOn(GithubClient.prototype, "createRepository").mockRejectedValue(refusal(422, { message: "Repository creation failed.", errors: [{ message: "name already exists on this account" }] }))

        await expect(new TemplateScaffoldService().createRepository(github, target(), "checkout", null)).rejects.toMatchObject({ code: "REPOSITORY_NAME_TAKEN", statusCode: 409 })
    })

    it("given any other refusal of the provider, when the repository is created, then the provider error goes through", async () => {
        const error = refusal(403, { message: "Resource not accessible by integration" })
        vi.spyOn(GithubClient.prototype, "createRepository").mockRejectedValue(error)

        await expect(new TemplateScaffoldService().createRepository(github, target(), "checkout", null)).rejects.toBe(error)
    })
})
