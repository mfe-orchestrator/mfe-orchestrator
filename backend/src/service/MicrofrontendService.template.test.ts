import { Types } from "mongoose"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("..", () => ({
    fastify: { log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }, config: {} }
}))

const getSingle = vi.fn()
vi.mock("./MarketService", () => ({
    default: class {
        getSingle = getSingle
    }
}))

const createRepository = vi.fn()
vi.mock("./TemplateScaffoldService", () => ({
    default: class {
        createRepository = createRepository
    }
}))

import { BusinessException } from "../errors/BusinessException"
import CodeRepository from "../models/CodeRepositoryModel"
import Microfrontend from "../models/MicrofrontendModel"
import Storage from "../models/StorageModel"
import MicrofrontendDTO from "../types/MicrofrontendDTO"
import MicrofrontendService from "./MicrofrontendService"

const projectId = new Types.ObjectId().toString()

afterEach(() => {
    vi.restoreAllMocks()
    getSingle.mockReset()
    createRepository.mockReset()
})

describe("MicrofrontendService.create from a template", () => {
    const create = async (template: Record<string, unknown>, host: Record<string, unknown> | undefined = { type: "MFE_ORCHESTRATOR_HUB" }) => {
        const service = new MicrofrontendService()
        vi.spyOn(service as unknown as { ensureAccessToProject: () => Promise<void> }, "ensureAccessToProject").mockResolvedValue()
        vi.spyOn(CodeRepository, "findById").mockResolvedValue({ _id: new Types.ObjectId(), projectId } as never)
        // The slug is free: checked before any repository is created
        vi.spyOn(Microfrontend, "exists").mockResolvedValue(null as never)
        const write = vi.spyOn(Microfrontend, "create").mockImplementation((async (doc: unknown) => doc) as never)
        getSingle.mockResolvedValue(template)
        await service.create(
            {
                name: "Cart",
                slug: "cart",
                version: "1.0.0",
                host,
                codeRepository: { enabled: true, codeRepositoryId: new Types.ObjectId().toString(), repositoryId: "", createData: { name: "cart", template: String(template.slug) } }
            } as unknown as MicrofrontendDTO,
            projectId
        )
        return write
    }

    it("given a backend service template, when a microfrontend is created from it, then it is refused before any repository is created", async () => {
        await expect(create({ slug: "service-node-fastify", type: "service", compiler: "docker", framework: "Node.js" })).rejects.toBeInstanceOf(BusinessException)
        expect(createRepository).not.toHaveBeenCalled()
    })

    it("given a microfrontend template, when a microfrontend is created from it, then the repository is scaffolded with its slug and without tree-wide placeholders", async () => {
        const write = await create({ slug: "vite-remote-react", type: "remote", compiler: "vite", framework: "React" })

        expect(createRepository).toHaveBeenCalledTimes(1)
        // The slug names the webpack container; tree-wide placeholders are a service template thing
        expect(createRepository.mock.calls[0][4]).toEqual({ microfrontendSlug: "cart" })
        expect(write).toHaveBeenCalledTimes(1)
    })

    /** The written document: what the microfrontend is stored with */
    const written = (write: { mock: { calls: unknown[][] } }) => write.mock.calls[0][0] as unknown as { host: Record<string, unknown>; stack: Record<string, unknown> }

    it.each([
        ["single-spa-remote-react", "single-spa", "index.js", "SINGLE_SPA"],
        ["microlc-remote-react", "micro-lc", "parcel.js", "MICRO_LC"]
    ])("given the %s template, when a microfrontend is created from it, then it is served by the template's entry point with its integration model", async (slug, compiler, entryPoint, stack) => {
        const write = await create({ slug, type: "remote", compiler, framework: "React", entryPoint })

        expect(written(write).host).toEqual({ type: "MFE_ORCHESTRATOR_HUB", entryPoint })
        expect(written(write).stack).toMatchObject({ framework: "REACT", compiler: stack, source: "TEMPLATE" })
    })

    it("given a template with an entry point and no host, when a microfrontend is created from it, then the default hosting gets that entry point", async () => {
        vi.spyOn(Storage, "findOne").mockResolvedValue(null as never)

        const write = await create({ slug: "microlc-remote-react", type: "remote", compiler: "micro-lc", framework: "React", entryPoint: "parcel.js" }, undefined)

        expect(written(write).host).toEqual({ type: "MFE_ORCHESTRATOR_HUB", entryPoint: "parcel.js" })
    })

    it("given a host with its own entry point, when a microfrontend is created from a template, then the given one is kept", async () => {
        const write = await create(
            { slug: "single-spa-remote-react", type: "remote", compiler: "single-spa", framework: "React", entryPoint: "index.js" },
            { type: "MFE_ORCHESTRATOR_HUB", entryPoint: "dist/app.js" }
        )

        expect(written(write).host).toEqual({ type: "MFE_ORCHESTRATOR_HUB", entryPoint: "dist/app.js" })
    })

    it("given a template without an entry point, when a microfrontend is created from it, then the host is left as given", async () => {
        const write = await create({ slug: "single-spa-host-react", type: "host", compiler: "single-spa", framework: "React" })

        expect(written(write).host).toEqual({ type: "MFE_ORCHESTRATOR_HUB" })
    })
})

describe("MicrofrontendService.create with a taken slug", () => {
    it("given a slug already taken in the project, when a microfrontend is created from a template, then it is refused before any repository is created", async () => {
        const service = new MicrofrontendService()
        vi.spyOn(service as unknown as { ensureAccessToProject: () => Promise<void> }, "ensureAccessToProject").mockResolvedValue()
        vi.spyOn(Microfrontend, "exists").mockResolvedValue({ _id: new Types.ObjectId() } as never)
        const write = vi.spyOn(Microfrontend, "create")

        const creation = service.create(
            {
                name: "Cart",
                slug: "cart",
                version: "1.0.0",
                codeRepository: { enabled: true, codeRepositoryId: new Types.ObjectId().toString(), repositoryId: "", createData: { name: "cart-fe", template: "react-vite" } }
            } as unknown as MicrofrontendDTO,
            projectId
        )

        await expect(creation).rejects.toMatchObject({ code: "MICROFRONTEND_SLUG_TAKEN", statusCode: 409 })
        expect(createRepository).not.toHaveBeenCalled()
        expect(write).not.toHaveBeenCalled()
    })
})
