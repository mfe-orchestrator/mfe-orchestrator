import { Types } from "mongoose"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// A standalone mongod cannot open a transaction, and runInTransaction already knows to skip one
vi.mock("../plugins/noSQL", () => ({ isReplicaSet: false }))

import { BusinessException } from "../errors/BusinessException"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import DomainLink from "../models/DomainLinkModel"
import Domain from "../models/DomainModel"
import Microfrontend from "../models/MicrofrontendModel"
import Service from "../models/ServiceModel"
import UserProject from "../models/UserProjectModel"
import DomainService, { resolveDomainId } from "./DomainService"

const projectId = new Types.ObjectId().toString()
const domainId = new Types.ObjectId()

const allowAccess = () => vi.spyOn(DomainService.prototype as unknown as { ensureAccessToProject: () => Promise<void> }, "ensureAccessToProject").mockResolvedValue(undefined)

afterEach(() => {
    vi.restoreAllMocks()
})

describe("DomainService.create", () => {
    beforeEach(() => {
        allowAccess()
    })

    it("given a name only, when a domain is created, then its slug comes from the name and it belongs to the project", async () => {
        vi.spyOn(Domain, "exists").mockResolvedValue(null)
        const write = vi.spyOn(Domain, "create").mockImplementation((async (doc: unknown) => doc) as never)

        await new DomainService().create({ name: "  Customer Payments ", description: "Checkout and refunds" }, projectId)

        expect(write).toHaveBeenCalledWith({ name: "Customer Payments", slug: "customer-payments", description: "Checkout and refunds", projectId })
    })

    it("given a context, when a domain is created, then it is stored with it", async () => {
        vi.spyOn(Domain, "exists").mockResolvedValue(null)
        const write = vi.spyOn(Domain, "create").mockImplementation((async (doc: unknown) => doc) as never)

        await new DomainService().create({ name: "Payments", context: "Prices are in cents" }, projectId)

        expect(write).toHaveBeenCalledWith(expect.objectContaining({ context: "Prices are in cents" }))
    })

    it("given a slug another domain of the project has, when a domain is created, then it is refused with a conflict and nothing is written", async () => {
        const exists = vi.spyOn(Domain, "exists").mockResolvedValue({ _id: domainId } as never)
        const write = vi.spyOn(Domain, "create")

        const refusal = new DomainService().create({ name: "Payments" }, projectId)

        await expect(refusal).rejects.toMatchObject({ code: "DOMAIN_SLUG_TAKEN", statusCode: 409 })
        expect(exists).toHaveBeenCalledWith({ slug: "payments", projectId })
        expect(write).not.toHaveBeenCalled()
    })

    /** Two creates of one slug at once: both pass the check, the unique index refuses the second */
    it("given the unique index refusing the slug, when a domain is created, then it is a conflict", async () => {
        vi.spyOn(Domain, "exists").mockResolvedValue(null)
        vi.spyOn(Domain, "create").mockRejectedValue(Object.assign(new Error("E11000 duplicate key error"), { code: 11000 }) as never)

        await expect(new DomainService().create({ name: "Payments" }, projectId)).rejects.toMatchObject({ code: "DOMAIN_SLUG_TAKEN", statusCode: 409 })
    })

    it("given a name over the schema limit, when a domain is created, then it is refused with a 400", async () => {
        vi.spyOn(Domain, "exists").mockResolvedValue(null)
        vi.spyOn(Domain, "create").mockRejectedValue(Object.assign(new Error("name is longer than the maximum allowed length (100)"), { name: "ValidationError" }) as never)

        await expect(new DomainService().create({ name: "x".repeat(101) }, projectId)).rejects.toMatchObject({ code: "DOMAIN_INVALID", statusCode: 400 })
    })

    it.each([[{ name: 42 }], [{ name: "Payments", slug: ["payments"] }], [{ name: "Payments", description: { text: "x" } }]])(
        "given the body %j, when a domain is created, then it is refused with a 400 before anything is read",
        async body => {
            const exists = vi.spyOn(Domain, "exists")

            await expect(new DomainService().create(body as never, projectId)).rejects.toMatchObject({ statusCode: 400 })
            expect(exists).not.toHaveBeenCalled()
        }
    )

    it.each([[""], ["   "], ["!!!"]])("given the name %j, when a domain is created, then it is refused", async name => {
        vi.spyOn(Domain, "exists").mockResolvedValue(null)
        const write = vi.spyOn(Domain, "create")

        await expect(new DomainService().create({ name }, projectId)).rejects.toBeInstanceOf(BusinessException)
        expect(write).not.toHaveBeenCalled()
    })
})

describe("resolveDomainId", () => {
    it("given a domain of the project, when it is resolved, then it is kept", async () => {
        const exists = vi.spyOn(Domain, "exists").mockResolvedValue({ _id: domainId } as never)

        await expect(resolveDomainId(String(domainId), projectId)).resolves.toBe(String(domainId))
        expect(exists).toHaveBeenCalledWith({ _id: String(domainId), projectId })
    })

    /** Membership never reaches across projects */
    it("given a domain of another project, when it is resolved, then it is not found", async () => {
        vi.spyOn(Domain, "exists").mockResolvedValue(null)

        await expect(resolveDomainId(String(domainId), projectId)).rejects.toMatchObject({ code: "DOMAIN_NOT_FOUND", statusCode: 404 })
    })

    it.each([[null], [""]])("given %j, when it is resolved, then the member is taken out of any domain without a lookup", async value => {
        const exists = vi.spyOn(Domain, "exists")

        await expect(resolveDomainId(value, projectId)).resolves.toBeNull()
        expect(exists).not.toHaveBeenCalled()
    })

    it.each([["not-an-id"], [42], [{ $ne: null }]])("given %j, when it is resolved, then it is refused", async value => {
        await expect(resolveDomainId(value, projectId)).rejects.toBeInstanceOf(BusinessException)
    })
})

describe("DomainService.getByProjectId", () => {
    it("given members in some domains, when the domains are listed, then each carries how many microfrontends and services it groups", async () => {
        allowAccess()
        const otherId = new Types.ObjectId()
        const domain = (id: Types.ObjectId, name: string) => ({ _id: id, toObject: () => ({ _id: id, name }) })
        vi.spyOn(Domain, "find").mockReturnValue({ sort: vi.fn().mockResolvedValue([domain(domainId, "Payments"), domain(otherId, "Search")]) } as never)
        vi.spyOn(Microfrontend, "find").mockResolvedValue([{ domainId }, { domainId }, { domainId: otherId }] as never)
        vi.spyOn(Service, "find").mockResolvedValue([{ domainId }] as never)

        const domains = await new DomainService().getByProjectId(projectId)

        expect(domains).toEqual([
            { _id: domainId, name: "Payments", microfrontendsCount: 2, servicesCount: 1 },
            { _id: otherId, name: "Search", microfrontendsCount: 1, servicesCount: 0 }
        ])
    })
})

describe("DomainService.delete", () => {
    const domain = { _id: domainId, projectId, slug: "payments", name: "Payments" }

    beforeEach(() => {
        allowAccess()
        vi.spyOn(Domain, "findById").mockResolvedValue(domain as never)
    })

    it("given a domain with members, when it is deleted, then its microfrontends and services lose the domain but are kept", async () => {
        const unsetMicrofrontends = vi.spyOn(Microfrontend, "updateMany").mockResolvedValue({ modifiedCount: 2 } as never)
        const unsetServices = vi.spyOn(Service, "updateMany").mockResolvedValue({ modifiedCount: 1 } as never)
        const deleteMicrofrontends = vi.spyOn(Microfrontend, "deleteMany")
        const deleteServices = vi.spyOn(Service, "deleteMany")
        const deleteLinks = vi.spyOn(DomainLink, "deleteMany").mockResolvedValue({ deletedCount: 1 } as never)
        const pullFromScopes = vi.spyOn(UserProject, "updateMany").mockResolvedValue({ modifiedCount: 1 } as never)
        const remove = vi.spyOn(Domain, "findByIdAndDelete").mockResolvedValue(domain as never)

        const deleted = await new DomainService().delete(String(domainId))

        const members = { projectId, domainId }
        expect(unsetMicrofrontends).toHaveBeenCalledWith(members, { $set: { domainId: null } }, expect.anything())
        expect(unsetServices).toHaveBeenCalledWith(members, { $set: { domainId: null } }, expect.anything())
        expect(deleteLinks).toHaveBeenCalledWith({ $or: [{ sourceDomainId: domainId }, { targetDomainId: domainId }] }, expect.anything())
        // Pulled from the scopes and nothing else: `domainScoped` stays, so an emptied scope reaches nothing rather than the whole project
        expect(pullFromScopes).toHaveBeenCalledWith({ projectId, domainIds: domainId }, { $pull: { domainIds: domainId } }, expect.anything())
        expect(remove).toHaveBeenCalledWith(domainId, expect.anything())
        expect(deleteMicrofrontends).not.toHaveBeenCalled()
        expect(deleteServices).not.toHaveBeenCalled()
        expect(deleted).toBe(domain)
    })

    it("given an unknown domain, when it is deleted, then it is not found and no member is touched", async () => {
        vi.spyOn(Domain, "findById").mockResolvedValue(null)
        const unset = vi.spyOn(Microfrontend, "updateMany")

        await expect(new DomainService().delete(String(domainId))).rejects.toBeInstanceOf(EntityNotFoundError)
        expect(unset).not.toHaveBeenCalled()
    })
})

describe("DomainService.addMembers", () => {
    const domain = { _id: domainId, projectId, slug: "payments", name: "Payments" }
    const microfrontendId = new Types.ObjectId().toString()
    const serviceId = new Types.ObjectId().toString()

    beforeEach(() => {
        allowAccess()
        vi.spyOn(Domain, "findById").mockResolvedValue(domain as never)
    })

    it("given microfrontends and services, when they are added, then only the ones of the domain's project are put in it", async () => {
        const moveMicrofrontends = vi.spyOn(Microfrontend, "updateMany").mockResolvedValue({ matchedCount: 1 } as never)
        const moveServices = vi.spyOn(Service, "updateMany").mockResolvedValue({ matchedCount: 1 } as never)

        const added = await new DomainService().addMembers(String(domainId), { microfrontendIds: [microfrontendId], serviceIds: [serviceId] })

        const membership = { $set: { domainId } }
        expect(moveMicrofrontends).toHaveBeenCalledWith({ _id: { $in: [microfrontendId] }, projectId }, membership, expect.anything())
        expect(moveServices).toHaveBeenCalledWith({ _id: { $in: [serviceId] }, projectId }, membership, expect.anything())
        expect(added).toEqual({ microfrontends: 1, services: 1 })
    })

    it.each([[{ microfrontendIds: "abc" }], [{ serviceIds: ["not-an-id"] }], [{ serviceIds: [42] }]])(
        "given the body %j, when members are added, then it is refused with a 400 and nothing is moved",
        async body => {
            const move = vi.spyOn(Microfrontend, "updateMany")

            await expect(new DomainService().addMembers(String(domainId), body as never)).rejects.toMatchObject({ code: "DOMAIN_INVALID", statusCode: 400 })
            expect(move).not.toHaveBeenCalled()
        }
    )

    it("given an unknown domain, when members are added, then it is not found and nothing is moved", async () => {
        vi.spyOn(Domain, "findById").mockResolvedValue(null)
        const move = vi.spyOn(Service, "updateMany")

        await expect(new DomainService().addMembers(String(domainId), { serviceIds: [serviceId] })).rejects.toBeInstanceOf(EntityNotFoundError)
        expect(move).not.toHaveBeenCalled()
    })
})

describe("DomainService.update", () => {
    it("given a slug and a project in the updates, when a domain is updated, then only name and description are written", async () => {
        allowAccess()
        const domain = { _id: domainId, projectId, slug: "payments", name: "Payments" }
        vi.spyOn(Domain, "findById").mockResolvedValue(domain as never)
        const write = vi.spyOn(Domain, "findByIdAndUpdate").mockResolvedValue(domain as never)

        await new DomainService().update(String(domainId), { name: "Billing", description: "Invoices", slug: "billing", projectId: "x" } as never)

        expect(write).toHaveBeenCalledWith(domainId, { name: "Billing", description: "Invoices" }, { new: true, runValidators: true })
    })

    it("given a context, when a domain is updated, then it is written, and null clears it", async () => {
        allowAccess()
        const domain = { _id: domainId, projectId, slug: "payments", name: "Payments" }
        vi.spyOn(Domain, "findById").mockResolvedValue(domain as never)
        const write = vi.spyOn(Domain, "findByIdAndUpdate").mockResolvedValue(domain as never)

        await new DomainService().update(String(domainId), { context: "Prices are in cents" } as never)
        await new DomainService().update(String(domainId), { context: null } as never)

        expect(write).toHaveBeenNthCalledWith(1, domainId, { context: "Prices are in cents" }, { new: true, runValidators: true })
        expect(write).toHaveBeenNthCalledWith(2, domainId, { context: null }, { new: true, runValidators: true })
    })

    it("given a context that is not a string, when a domain is updated, then it is refused with a 400 and nothing is written", async () => {
        allowAccess()
        vi.spyOn(Domain, "findById").mockResolvedValue({ _id: domainId, projectId, slug: "payments", name: "Payments" } as never)
        const write = vi.spyOn(Domain, "findByIdAndUpdate")

        await expect(new DomainService().update(String(domainId), { context: 42 } as never)).rejects.toMatchObject({ code: "DOMAIN_INVALID", statusCode: 400 })
        expect(write).not.toHaveBeenCalled()
    })

    it("given a name that is not a string, when a domain is updated, then it is refused with a 400 and nothing is written", async () => {
        allowAccess()
        vi.spyOn(Domain, "findById").mockResolvedValue({ _id: domainId, projectId, slug: "payments", name: "Payments" } as never)
        const write = vi.spyOn(Domain, "findByIdAndUpdate")

        await expect(new DomainService().update(String(domainId), { name: 42 } as never)).rejects.toMatchObject({ code: "DOMAIN_INVALID", statusCode: 400 })
        expect(write).not.toHaveBeenCalled()
    })
})
