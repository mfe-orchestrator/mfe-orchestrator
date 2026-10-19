import { beforeEach, describe, expect, it, vi } from "vitest"
import { EntityNotFoundError } from "../../errors/EntityNotFoundError"
import UserCannotAccessThisProjectError from "../../errors/UserCannotAccessThisProjectError"
import { MCP_SCOPE_READ, MCP_SCOPE_WRITE } from "../../utils/oauthConfig"
import { McpSession, McpToolContext } from "../toolDefinition"
import { domainTools } from "./domainTools"
import { microfrontendTools } from "./microfrontendTools"

const listDomains = vi.fn()
const getDomain = vi.fn()
const createDomain = vi.fn()
const updateDomain = vi.fn()
const deleteDomain = vi.fn()
const listMicrofrontends = vi.fn()
const getMicrofrontend = vi.fn()
const createMicrofrontend = vi.fn()
const updateMicrofrontend = vi.fn()
const listServices = vi.fn()
const getContext = vi.fn()

// Hoisted with the mocks below, which build their service classes with it
const { principals, serviceClass } = vi.hoisted(() => {
    const principals: unknown[] = []
    const serviceClass = (methods: Record<string, unknown>) =>
        class {
            constructor(principal: unknown) {
                principals.push(principal)
                Object.assign(this, methods)
            }
        }
    return { principals, serviceClass }
})

vi.mock("../../service/DomainService", () => ({
    default: serviceClass({
        getByProjectId: (...args: unknown[]) => listDomains(...args),
        getById: (...args: unknown[]) => getDomain(...args),
        create: (...args: unknown[]) => createDomain(...args),
        update: (...args: unknown[]) => updateDomain(...args),
        delete: (...args: unknown[]) => deleteDomain(...args)
    })
}))
vi.mock("../../service/MicrofrontendService", () => ({
    default: serviceClass({
        getByProjectId: (...args: unknown[]) => listMicrofrontends(...args),
        getById: (...args: unknown[]) => getMicrofrontend(...args),
        create: (...args: unknown[]) => createMicrofrontend(...args),
        update: (...args: unknown[]) => updateMicrofrontend(...args)
    })
}))
vi.mock("../../service/ServiceService", () => ({ default: serviceClass({ getByProjectId: (...args: unknown[]) => listServices(...args) }) }))
vi.mock("../../service/ProjectService", () => ({ default: serviceClass({ getContext: (...args: unknown[]) => getContext(...args) }) }))

const PROJECT = "aaaaaaaaaaaaaaaaaaaaaaaa"
const DOMAIN = "bbbbbbbbbbbbbbbbbbbbbbbb"
const FOREIGN_DOMAIN = "cccccccccccccccccccccccc"
const MICROFRONTEND = "dddddddddddddddddddddddd"
const SERVICE = "eeeeeeeeeeeeeeeeeeeeeeee"

const tools = [...domainTools, ...microfrontendTools]
const tool = (name: string) => tools.find(candidate => candidate.name === name)!

const context = (): McpToolContext => {
    const session: McpSession = {
        principal: { _id: "user-1", email: "user@example.com" } as never,
        projects: [{ projectId: PROJECT, role: "MEMBER" }],
        scopes: [MCP_SCOPE_READ, MCP_SCOPE_WRITE],
        credential: { kind: "console", userId: "user-1" }
    }
    return { principal: { ...session.principal, restrictedToProjectIds: [PROJECT] }, projectId: PROJECT, scopes: session.scopes, credential: session.credential, session }
}

/** Runs the tool on its parsed input, as the MCP server and the assistant do. */
const run = (name: string, args: Record<string, unknown>) => tool(name).run(tool(name).inputSchema.parse(args) as never, context())

const domain = { _id: DOMAIN, name: "Checkout", slug: "checkout", toObject: () => ({ _id: DOMAIN, name: "Checkout", slug: "checkout" }) }

describe("domain tools", () => {
    beforeEach(() => {
        for (const mock of [listDomains, getDomain, createDomain, updateDomain, deleteDomain, listMicrofrontends, getMicrofrontend, createMicrofrontend, updateMicrofrontend, listServices]) {
            mock.mockReset()
        }
        principals.length = 0
    })

    it("given their definitions, when read, then reads need mfe:read, writes mfe:write and only the delete is destructive", () => {
        for (const definition of domainTools) {
            expect(definition.consoleOnly, definition.name).toBeFalsy()
            expect(definition.scope, definition.name).toBe(["domains_list", "domain_get"].includes(definition.name) ? MCP_SCOPE_READ : MCP_SCOPE_WRITE)
        }
        expect(domainTools.filter(definition => definition.annotations.destructiveHint).map(definition => definition.name)).toEqual(["domain_delete"])
        expect(tool("domain_delete").description).toContain('"no domain"')
    })

    it("given domains with members, when listed, then the counts the service returns come back from the project of the token", async () => {
        const domains = [{ _id: DOMAIN, name: "Checkout", microfrontendsCount: 2, servicesCount: 1 }]
        listDomains.mockResolvedValue(domains)

        expect(await run("domains_list", {})).toEqual(domains)
        expect(listDomains).toHaveBeenCalledWith(PROJECT)
        expect(principals[0]).toMatchObject({ restrictedToProjectIds: [PROJECT] })
    })

    it("given a domain, when read, then its microfrontends and services are listed by id, name and slug, with the AI context of the domain", async () => {
        const aiContext = { project: { id: PROJECT, name: "Shop" }, domains: [{ id: DOMAIN, slug: "checkout", name: "Checkout", context: "Prices are in cents" }], microfrontends: [], services: [] }
        getContext.mockResolvedValue(aiContext)
        getDomain.mockResolvedValue(domain)
        listMicrofrontends.mockResolvedValue([
            { _id: MICROFRONTEND, name: "Cart", slug: "cart", domainId: DOMAIN, version: "1.0.0" },
            { _id: "ffffffffffffffffffffffff", name: "Search", slug: "search", domainId: null }
        ])
        listServices.mockResolvedValue([{ _id: SERVICE, name: "Orders API", slug: "orders-api", domainId: DOMAIN, port: 8080 }])

        expect(await run("domain_get", { domainId: DOMAIN })).toEqual({
            _id: DOMAIN,
            name: "Checkout",
            slug: "checkout",
            microfrontends: [{ _id: MICROFRONTEND, name: "Cart", slug: "cart" }],
            services: [{ _id: SERVICE, name: "Orders API", slug: "orders-api" }],
            aiContext
        })
        expect(getContext).toHaveBeenCalledWith(PROJECT, { domainId: DOMAIN })
    })

    it("given a domain that does not exist, when read, then it is not found", async () => {
        getDomain.mockResolvedValue(null)

        await expect(run("domain_get", { domainId: DOMAIN })).rejects.toBeInstanceOf(EntityNotFoundError)
    })

    it("given a name, a slug and a description, when created, then the domain is created in the project", async () => {
        createDomain.mockResolvedValue(domain)
        const input = { name: "Checkout", slug: "checkout", description: "Paying for the cart" }

        expect(await run("domain_create", input)).toBe(domain)
        expect(createDomain).toHaveBeenCalledWith(input, PROJECT)
    })

    it("given an invalid slug or an empty name, when the input is validated, then it is refused", () => {
        const schema = tool("domain_create").inputSchema

        expect(schema.safeParse({ name: "Checkout" }).success).toBe(true)
        expect(schema.safeParse({ name: "" }).success).toBe(false)
        expect(schema.safeParse({ name: "Checkout", slug: "Check out" }).success).toBe(false)
    })

    it("given a new name and description, when updated, then only those reach the service and a slug is dropped", async () => {
        updateDomain.mockResolvedValue(domain)

        await run("domain_update", { domainId: DOMAIN, name: "Payments", description: "Money", slug: "payments" })

        expect(updateDomain).toHaveBeenCalledWith(DOMAIN, { name: "Payments", description: "Money" })
    })

    it("given null as description, when updated, then null reaches the service to clear it", async () => {
        updateDomain.mockResolvedValue(domain)

        await run("domain_update", { domainId: DOMAIN, description: null })

        expect(updateDomain).toHaveBeenCalledWith(DOMAIN, { description: null })
    })

    it("given a domain of another project, when updated, then the refusal surfaces", async () => {
        updateDomain.mockRejectedValue(new UserCannotAccessThisProjectError())

        await expect(run("domain_update", { domainId: FOREIGN_DOMAIN, name: "Payments" })).rejects.toBeInstanceOf(UserCannotAccessThisProjectError)
    })

    it("given a domain, when deleted, then the service deletes it", async () => {
        deleteDomain.mockResolvedValue(domain)

        expect(await run("domain_delete", { domainId: DOMAIN })).toBe(domain)
        expect(deleteDomain).toHaveBeenCalledWith(DOMAIN)
    })

    it("given a domain of another project, when deleted, then the refusal surfaces", async () => {
        deleteDomain.mockRejectedValue(new UserCannotAccessThisProjectError())

        await expect(run("domain_delete", { domainId: FOREIGN_DOMAIN })).rejects.toBeInstanceOf(UserCannotAccessThisProjectError)
    })
})

describe("microfrontend tools and domains", () => {
    beforeEach(() => {
        for (const mock of [getDomain, listMicrofrontends, getMicrofrontend, createMicrofrontend, updateMicrofrontend]) {
            mock.mockReset()
        }
    })

    const microfrontends = [
        { _id: MICROFRONTEND, slug: "cart", domainId: DOMAIN },
        { _id: "ffffffffffffffffffffffff", slug: "search", domainId: null },
        { _id: "999999999999999999999999", slug: "legacy" }
    ]

    it("given microfrontends in and out of domains, when listed by domain, then only the matching ones come back", async () => {
        listMicrofrontends.mockResolvedValue(microfrontends)
        getDomain.mockResolvedValue(domain)

        expect(((await run("microfrontends_list", { domainId: DOMAIN })) as { slug: string }[]).map(item => item.slug)).toEqual(["cart"])
        expect(getDomain).toHaveBeenCalledWith(DOMAIN)
        expect(((await run("microfrontends_list", { domainId: "none" })) as { slug: string }[]).map(item => item.slug)).toEqual(["search", "legacy"])
        expect(((await run("microfrontends_list", {})) as unknown[]).length).toBe(3)
        expect(getDomain).toHaveBeenCalledTimes(1)
    })

    it("given a domain id in uppercase, when listed by it, then the same microfrontends come back", async () => {
        listMicrofrontends.mockResolvedValue(microfrontends)
        getDomain.mockResolvedValue(domain)

        expect(((await run("microfrontends_list", { domainId: DOMAIN.toUpperCase() })) as { slug: string }[]).map(item => item.slug)).toEqual(["cart"])
    })

    it("given an unknown domain or one of another project, when listed by it, then it is not found rather than an empty list", async () => {
        listMicrofrontends.mockResolvedValue(microfrontends)
        getDomain.mockResolvedValueOnce(null).mockRejectedValueOnce(new UserCannotAccessThisProjectError())

        await expect(run("microfrontends_list", { domainId: FOREIGN_DOMAIN })).rejects.toBeInstanceOf(EntityNotFoundError)
        await expect(run("microfrontends_list", { domainId: FOREIGN_DOMAIN })).rejects.toBeInstanceOf(UserCannotAccessThisProjectError)
    })

    it("given a domain filter that is neither an id nor none, when validated, then it is refused", () => {
        expect(tool("microfrontends_list").inputSchema.safeParse({ domainId: "all" }).success).toBe(false)
    })

    it("given a domain of the project, when a microfrontend is created in it, then the domain reaches the service", async () => {
        getDomain.mockResolvedValue(domain)
        createMicrofrontend.mockResolvedValue({ _id: MICROFRONTEND })

        await run("microfrontend_create", { name: "Cart", slug: "cart", version: "1.0.0", domainId: DOMAIN })

        expect(getDomain).toHaveBeenCalledWith(DOMAIN)
        expect(createMicrofrontend).toHaveBeenCalledWith(expect.objectContaining({ domainId: DOMAIN }), PROJECT)
    })

    it("given a domain of another project, when a microfrontend is created in it, then it is refused before anything is written", async () => {
        getDomain.mockRejectedValue(new UserCannotAccessThisProjectError())

        await expect(run("microfrontend_create", { name: "Cart", slug: "cart", version: "1.0.0", domainId: FOREIGN_DOMAIN })).rejects.toBeInstanceOf(UserCannotAccessThisProjectError)
        expect(createMicrofrontend).not.toHaveBeenCalled()
    })

    it("given a domain that does not exist, when a microfrontend is moved to it, then it is refused before anything is written", async () => {
        getMicrofrontend.mockResolvedValue({ _id: MICROFRONTEND })
        getDomain.mockResolvedValue(null)

        await expect(run("microfrontend_update", { microfrontendId: MICROFRONTEND, domainId: FOREIGN_DOMAIN })).rejects.toBeInstanceOf(EntityNotFoundError)
        expect(updateMicrofrontend).not.toHaveBeenCalled()
    })

    it("given null as domain, when a microfrontend is updated, then it is taken out of its domain without a lookup", async () => {
        getMicrofrontend.mockResolvedValue({ _id: MICROFRONTEND })
        updateMicrofrontend.mockResolvedValue({ _id: MICROFRONTEND, domainId: null })
        await run("microfrontend_update", { microfrontendId: MICROFRONTEND, domainId: null })

        expect(getDomain).not.toHaveBeenCalled()
        expect(updateMicrofrontend).toHaveBeenCalledWith(MICROFRONTEND, { domainId: null })
    })
})
