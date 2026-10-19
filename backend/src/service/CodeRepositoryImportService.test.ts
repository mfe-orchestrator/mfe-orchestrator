import { Types } from "mongoose"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CodeRepositoryProvider } from "../models/CodeRepositoryModel"
import Domain from "../models/DomainModel"
import Microfrontend from "../models/MicrofrontendModel"
import Service from "../models/ServiceModel"
import Storage from "../models/StorageModel"
import CodeRepositoryImportService from "./CodeRepositoryImportService"
import CodeRepositoryService from "./CodeRepositoryService"

const projectId = new Types.ObjectId().toString()
const domainId = new Types.ObjectId().toString()
const connection = { _id: new Types.ObjectId(), projectId, provider: CodeRepositoryProvider.GITHUB }

/** A find answering with these documents */
const found = (documents: unknown[]) => vi.fn().mockResolvedValue(documents) as never

beforeEach(() => {
    vi.spyOn(CodeRepositoryService.prototype, "findById").mockResolvedValue(connection as never)
    vi.spyOn(CodeRepositoryService.prototype, "getRepositories").mockResolvedValue([
        { id: 1, name: "orders-api" },
        { id: 2, name: "checkout-fe" }
    ] as never)
    vi.spyOn(Storage, "findOne").mockResolvedValue(null)
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe("CodeRepositoryImportService.importRepositories", () => {
    it("given the service target and a domain, when a repository is imported, then it becomes a service of that domain and no microfrontend is created", async () => {
        vi.spyOn(Domain, "exists").mockResolvedValue({ _id: domainId } as never)
        vi.spyOn(Service, "find").mockImplementation(found([]))
        vi.spyOn(Microfrontend, "find").mockImplementation(found([]))
        const createService = vi.spyOn(Service, "create").mockImplementation((async (doc: object) => ({ ...doc, _id: new Types.ObjectId() })) as never)
        const createMicrofrontend = vi.spyOn(Microfrontend, "create")

        const result = await new CodeRepositoryImportService().importRepositories(String(connection._id), { repositoryIds: ["1"], target: "service", domainId })

        expect(createService).toHaveBeenCalledWith(expect.objectContaining({ name: "orders-api", slug: "orders-api", projectId, domainId }))
        expect(createService.mock.calls[0][0]).not.toHaveProperty("version")
        expect(createMicrofrontend).not.toHaveBeenCalled()
        expect(result.imported).toEqual([expect.objectContaining({ repositoryId: "1", serviceId: expect.any(String) })])
    })

    it("given a repository already linked to a microfrontend, when it is imported as a service, then it is skipped", async () => {
        vi.spyOn(Microfrontend, "find").mockImplementation(found([{ _id: new Types.ObjectId(), slug: "orders-api", name: "orders-api", codeRepository: { repositoryId: "1", name: "orders-api" } }]))
        vi.spyOn(Service, "find").mockImplementation(found([]))
        const createService = vi.spyOn(Service, "create")

        const result = await new CodeRepositoryImportService().importRepositories(String(connection._id), { repositoryIds: ["1"], target: "service" })

        expect(createService).not.toHaveBeenCalled()
        expect(result.skipped).toEqual([{ repositoryId: "1", name: "orders-api", reason: "ALREADY_IMPORTED" }])
    })

    it("given a repository already linked to a service, when it is imported as a microfrontend, then it is skipped", async () => {
        vi.spyOn(Microfrontend, "find").mockImplementation(found([]))
        vi.spyOn(Service, "find").mockImplementation(found([{ _id: new Types.ObjectId(), slug: "orders-api", name: "orders-api", codeRepository: { repositoryId: "1", name: "orders-api" } }]))
        const createMicrofrontend = vi.spyOn(Microfrontend, "create")

        const result = await new CodeRepositoryImportService().importRepositories(String(connection._id), { repositoryIds: ["1"] })

        expect(createMicrofrontend).not.toHaveBeenCalled()
        expect(result.skipped).toEqual([{ repositoryId: "1", name: "orders-api", reason: "ALREADY_IMPORTED" }])
    })

    it("given a repository name longer than a service slug allows, when it is imported as a service, then it fails alone with a clear error", async () => {
        vi.spyOn(CodeRepositoryService.prototype, "getRepositories").mockResolvedValue([
            { id: 3, name: "a".repeat(60) },
            { id: 1, name: "orders-api" }
        ] as never)
        vi.spyOn(Service, "find").mockImplementation(found([]))
        vi.spyOn(Microfrontend, "find").mockImplementation(found([]))
        const createService = vi.spyOn(Service, "create").mockImplementation((async (doc: object) => ({ ...doc, _id: new Types.ObjectId() })) as never)

        const result = await new CodeRepositoryImportService().importRepositories(String(connection._id), { target: "service" })

        expect(result.failed).toEqual([expect.objectContaining({ repositoryId: "3", error: expect.stringContaining("not a valid service slug") })])
        expect(createService).toHaveBeenCalledTimes(1)
        expect(result.imported).toEqual([expect.objectContaining({ repositoryId: "1" })])
    })

    it.each([["services"], [["service"]]])("given the target %j, when repositories are imported, then it is refused before anything is read", async target => {
        const createMicrofrontend = vi.spyOn(Microfrontend, "create")

        await expect(new CodeRepositoryImportService().importRepositories(String(connection._id), { target } as never)).rejects.toMatchObject({ code: "IMPORT_TARGET_INVALID", statusCode: 400 })
        expect(createMicrofrontend).not.toHaveBeenCalled()
    })

    it("given a domain of another project, when repositories are imported, then the batch is refused before anything is created", async () => {
        vi.spyOn(Domain, "exists").mockResolvedValue(null)
        const createMicrofrontend = vi.spyOn(Microfrontend, "create")

        await expect(new CodeRepositoryImportService().importRepositories(String(connection._id), { domainId })).rejects.toMatchObject({ code: "DOMAIN_NOT_FOUND", statusCode: 404 })
        expect(createMicrofrontend).not.toHaveBeenCalled()
    })

    it("given no target, when a repository is imported, then it becomes a microfrontend of the domain with the default version", async () => {
        vi.spyOn(Domain, "exists").mockResolvedValue({ _id: domainId } as never)
        vi.spyOn(Microfrontend, "find").mockImplementation(found([]))
        vi.spyOn(Service, "find").mockImplementation(found([]))
        const createMicrofrontend = vi.spyOn(Microfrontend, "create").mockImplementation((async (doc: object) => ({ ...doc, _id: new Types.ObjectId() })) as never)

        const result = await new CodeRepositoryImportService().importRepositories(String(connection._id), { repositoryIds: ["2"], domainId })

        expect(createMicrofrontend).toHaveBeenCalledWith(expect.objectContaining({ name: "checkout-fe", slug: "checkout-fe", version: "1.0.0", domainId }))
        expect(result.imported).toEqual([expect.objectContaining({ repositoryId: "2", microfrontendId: expect.any(String) })])
    })
})
