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
import MicrofrontendDTO from "../types/MicrofrontendDTO"
import MicrofrontendService from "./MicrofrontendService"

const projectId = new Types.ObjectId().toString()

afterEach(() => {
    vi.restoreAllMocks()
    getSingle.mockReset()
    createRepository.mockReset()
})

describe("MicrofrontendService.create from a template", () => {
    const create = async (template: Record<string, unknown>) => {
        const service = new MicrofrontendService()
        vi.spyOn(service as unknown as { ensureAccessToProject: () => Promise<void> }, "ensureAccessToProject").mockResolvedValue()
        vi.spyOn(CodeRepository, "findById").mockResolvedValue({ _id: new Types.ObjectId(), projectId } as never)
        const write = vi.spyOn(Microfrontend, "create").mockImplementation((async (doc: unknown) => doc) as never)
        getSingle.mockResolvedValue(template)
        await service.create(
            {
                name: "Cart",
                slug: "cart",
                version: "1.0.0",
                host: { type: "MFE_ORCHESTRATOR_HUB" },
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
})
