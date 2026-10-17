import { Types } from "mongoose"
import { afterEach, describe, expect, it, vi } from "vitest"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import Service from "../models/ServiceModel"
import MicrofrontendService from "./MicrofrontendService"

const projectId = new Types.ObjectId()

/** A microfrontend whose save returns itself, so the test reads what would be written */
const microfrontendWith = (serviceIds?: Types.ObjectId[]) => {
    const microfrontend = { _id: new Types.ObjectId(), projectId, serviceIds, save: vi.fn() }
    microfrontend.save.mockImplementation(async () => microfrontend)
    return microfrontend
}

const serviceFor = (microfrontend: ReturnType<typeof microfrontendWith>) => {
    const service = new MicrofrontendService()
    vi.spyOn(service, "getById").mockResolvedValue(microfrontend as never)
    return service
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe("MicrofrontendService.linkService", () => {
    it("given a service of the same project, when it is linked, then the microfrontend keeps its id", async () => {
        const backend = { _id: new Types.ObjectId(), projectId }
        vi.spyOn(Service, "findById").mockResolvedValue(backend as never)
        const microfrontend = microfrontendWith()

        const saved = await serviceFor(microfrontend).linkService(microfrontend._id.toString(), backend._id.toString())

        expect(saved.serviceIds?.map(String)).toEqual([backend._id.toString()])
    })

    it("given a service already linked, when it is linked again, then it is not duplicated", async () => {
        const backend = { _id: new Types.ObjectId(), projectId }
        vi.spyOn(Service, "findById").mockResolvedValue(backend as never)
        const microfrontend = microfrontendWith([backend._id])

        const saved = await serviceFor(microfrontend).linkService(microfrontend._id.toString(), backend._id.toString())

        expect(saved.serviceIds).toHaveLength(1)
    })

    it("given a service of another project, when it is linked, then it is not found", async () => {
        const backend = { _id: new Types.ObjectId(), projectId: new Types.ObjectId() }
        vi.spyOn(Service, "findById").mockResolvedValue(backend as never)
        const microfrontend = microfrontendWith()

        await expect(serviceFor(microfrontend).linkService(microfrontend._id.toString(), backend._id.toString())).rejects.toBeInstanceOf(EntityNotFoundError)
        expect(microfrontend.save).not.toHaveBeenCalled()
    })
})

describe("MicrofrontendService.unlinkService", () => {
    it("given a linked service, when it is unlinked, then only that link goes", async () => {
        const kept = new Types.ObjectId()
        const removed = new Types.ObjectId()
        const microfrontend = microfrontendWith([kept, removed])

        const saved = await serviceFor(microfrontend).unlinkService(microfrontend._id.toString(), removed.toString())

        expect(saved.serviceIds?.map(String)).toEqual([kept.toString()])
    })
})
