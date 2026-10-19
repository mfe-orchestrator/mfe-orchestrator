import { Types } from "mongoose"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import DomainLink from "../models/DomainLinkModel"
import Domain from "../models/DomainModel"
import DomainLinkService from "./DomainLinkService"

const projectId = new Types.ObjectId().toString()
const payments = new Types.ObjectId().toString()
const checkout = new Types.ObjectId().toString()

const allowAccess = () => vi.spyOn(DomainLinkService.prototype as unknown as { ensureAccessToProject: () => Promise<void> }, "ensureAccessToProject").mockResolvedValue(undefined)

afterEach(() => {
    vi.restoreAllMocks()
})

describe("DomainLinkService.create", () => {
    beforeEach(() => {
        allowAccess()
    })

    it("given two domains of the project, when they are linked, then the link is stored from the first to the second with its label", async () => {
        vi.spyOn(Domain, "exists").mockResolvedValue({ _id: payments } as never)
        vi.spyOn(DomainLink, "exists").mockResolvedValue(null)
        const write = vi.spyOn(DomainLink, "create").mockImplementation((async (doc: unknown) => doc) as never)

        await new DomainLinkService().create({ sourceDomainId: payments, targetDomainId: checkout, label: "  uses " }, projectId)

        expect(write).toHaveBeenCalledWith({ projectId, sourceDomainId: payments, targetDomainId: checkout, label: "uses" })
    })

    it("given a blank label, when two domains are linked, then the link is stored without one", async () => {
        vi.spyOn(Domain, "exists").mockResolvedValue({ _id: payments } as never)
        vi.spyOn(DomainLink, "exists").mockResolvedValue(null)
        const write = vi.spyOn(DomainLink, "create").mockImplementation((async (doc: unknown) => doc) as never)

        await new DomainLinkService().create({ sourceDomainId: payments, targetDomainId: checkout, label: "   " }, projectId)

        expect(write).toHaveBeenCalledWith(expect.objectContaining({ label: undefined }))
    })

    it("given the same domain on both ends, when it is linked, then it is refused and nothing is written", async () => {
        vi.spyOn(Domain, "exists").mockResolvedValue({ _id: payments } as never)
        const write = vi.spyOn(DomainLink, "create")

        const refusal = new DomainLinkService().create({ sourceDomainId: payments, targetDomainId: payments }, projectId)

        await expect(refusal).rejects.toMatchObject({ code: "DOMAIN_LINK_INVALID" })
        expect(write).not.toHaveBeenCalled()
    })

    it("given a domain of another project, when it is linked, then it is refused as not found", async () => {
        const exists = vi
            .spyOn(Domain, "exists")
            .mockResolvedValueOnce({ _id: payments } as never)
            .mockResolvedValueOnce(null)
        const write = vi.spyOn(DomainLink, "create")

        const refusal = new DomainLinkService().create({ sourceDomainId: payments, targetDomainId: checkout }, projectId)

        await expect(refusal).rejects.toMatchObject({ code: "DOMAIN_NOT_FOUND", statusCode: 404 })
        expect(exists).toHaveBeenLastCalledWith({ _id: checkout, projectId })
        expect(write).not.toHaveBeenCalled()
    })

    it("given an id that is not one, when it is linked, then it is refused before any lookup", async () => {
        const exists = vi.spyOn(Domain, "exists")

        const refusal = new DomainLinkService().create({ sourceDomainId: "payments", targetDomainId: checkout }, projectId)

        await expect(refusal).rejects.toMatchObject({ code: "DOMAIN_LINK_INVALID" })
        expect(exists).not.toHaveBeenCalled()
    })

    it("given two domains already linked that way, when they are linked again, then it is a conflict", async () => {
        vi.spyOn(Domain, "exists").mockResolvedValue({ _id: payments } as never)
        vi.spyOn(DomainLink, "exists").mockResolvedValue({ _id: new Types.ObjectId() } as never)
        const write = vi.spyOn(DomainLink, "create")

        const refusal = new DomainLinkService().create({ sourceDomainId: payments, targetDomainId: checkout }, projectId)

        await expect(refusal).rejects.toMatchObject({ code: "DOMAIN_LINK_EXISTS", statusCode: 409 })
        expect(write).not.toHaveBeenCalled()
    })

    /** Two creates of one link at once: both pass the check, the unique index refuses the second */
    it("given the unique index refusing the link, when two domains are linked, then it is a conflict", async () => {
        vi.spyOn(Domain, "exists").mockResolvedValue({ _id: payments } as never)
        vi.spyOn(DomainLink, "exists").mockResolvedValue(null)
        vi.spyOn(DomainLink, "create").mockRejectedValue(Object.assign(new Error("E11000 duplicate key error"), { code: 11000 }) as never)

        const refusal = new DomainLinkService().create({ sourceDomainId: payments, targetDomainId: checkout }, projectId)

        await expect(refusal).rejects.toMatchObject({ code: "DOMAIN_LINK_EXISTS", statusCode: 409 })
    })
})

describe("DomainLinkService.delete", () => {
    it("given a link of a project the user can access, when it is deleted, then it is removed", async () => {
        const access = allowAccess()
        const linkId = new Types.ObjectId()
        vi.spyOn(DomainLink, "findById").mockResolvedValue({ _id: linkId, projectId } as never)
        const remove = vi.spyOn(DomainLink, "findByIdAndDelete").mockResolvedValue({ _id: linkId } as never)

        await new DomainLinkService().delete(linkId.toString())

        expect(access).toHaveBeenCalledWith(projectId)
        expect(remove).toHaveBeenCalledWith(linkId)
    })

    it("given an unknown link, when it is deleted, then it is not found", async () => {
        vi.spyOn(DomainLink, "findById").mockResolvedValue(null)
        const remove = vi.spyOn(DomainLink, "findByIdAndDelete")

        await expect(new DomainLinkService().delete(new Types.ObjectId().toString())).rejects.toBeInstanceOf(EntityNotFoundError)
        expect(remove).not.toHaveBeenCalled()
    })
})
