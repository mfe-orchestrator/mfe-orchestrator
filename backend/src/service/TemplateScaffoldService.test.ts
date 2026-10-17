import AdmZip from "adm-zip"
import axios from "axios"
import fs from "fs-extra"
import os from "os"
import { join } from "path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { parse as parseYaml } from "yaml"

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
import AzureDevOpsClient from "../client/AzureDevOpsClient"
import GithubClient from "../client/GithubClient"
import GitlabClient from "../client/GitlabClient"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import CodeRepository, { CodeRepositoryProvider, ICodeRepository } from "../models/CodeRepositoryModel"
import { IMarket } from "../models/MarketModel"
import Microfrontend from "../models/MicrofrontendModel"
import Service from "../models/ServiceModel"
import { MicrofrontendCompiler, MicrofrontendFramework, MicrofrontendStackSource } from "../types/MicrofrontendStack"
import MarketService from "./MarketService"
import MicrofrontendService from "./MicrofrontendService"
import ServiceService from "./ServiceService"
import TemplateScaffoldService, { placeholderDomain, replaceFederationName } from "./TemplateScaffoldService"

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

        await service.injectTemplateGitlab("orders-api", "token", "https://gitlab.com", "orders-api", "acme", codeRepository, "gitlab", serviceTemplate, { placeholders: servicePlaceholders })

        expectReplacedEverywhere()
    })

    it("given Azure DevOps, when a service template is scaffolded, then every text file has its placeholders replaced before the initial commit", async () => {
        const service = scaffoldWith(await templateZip(serviceFiles), await pipelinesZip({}))
        const codeRepository = { provider: CodeRepositoryProvider.AZURE_DEV_OPS, azureData: { organization: "acme", projectId: "p" } } as unknown as ICodeRepository

        await service.injectTemplateAzureDevOps("orders-api", "token", "orders-api", codeRepository, "azure_dev_ops", serviceTemplate, { placeholders: servicePlaceholders })

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
        testCase.stub()
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

    it("given a service linked to a connection of another project, when it is built, then it is refused before the provider is called", async () => {
        connectionOf(otherProjectId)
        vi.spyOn(Service, "findById").mockResolvedValue({ _id: new Types.ObjectId(), projectId, slug: "orders-api", codeRepository: link } as never)
        vi.spyOn(ServiceService.prototype as unknown as { ensureAccessToService: () => Promise<void> }, "ensureAccessToService").mockResolvedValue(undefined)

        await expect(new ServiceService().build(String(new Types.ObjectId()), "1.2.0")).rejects.toBeInstanceOf(EntityNotFoundError)
        expect(createTag).not.toHaveBeenCalled()
    })
})

describe("TemplateScaffoldService.downloadZip", () => {
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
