import { beforeEach, describe, expect, it, vi } from "vitest"
import { EntityNotFoundError } from "../../errors/EntityNotFoundError"
import UserCannotAccessThisProjectError from "../../errors/UserCannotAccessThisProjectError"
import { MCP_SCOPE_READ, MCP_SCOPE_WRITE } from "../../utils/oauthConfig"
import { McpSession, McpToolContext } from "../toolDefinition"
import { serviceTools } from "./serviceTools"

const listServices = vi.fn()
const getService = vi.fn()
const createService = vi.fn()
const updateService = vi.fn()
const deleteService = vi.fn()
const serviceVersions = vi.fn()
const buildService = vi.fn()
const getDomain = vi.fn()
const findCodeRepository = vi.fn()
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

vi.mock("../../service/ServiceService", () => ({
    default: serviceClass({
        getByProjectId: (...args: unknown[]) => listServices(...args),
        getById: (...args: unknown[]) => getService(...args),
        create: (...args: unknown[]) => createService(...args),
        update: (...args: unknown[]) => updateService(...args),
        delete: (...args: unknown[]) => deleteService(...args),
        getVersionsById: (...args: unknown[]) => serviceVersions(...args),
        build: (...args: unknown[]) => buildService(...args)
    })
}))
vi.mock("../../service/DomainService", () => ({ default: serviceClass({ getById: (...args: unknown[]) => getDomain(...args) }) }))
vi.mock("../../service/ProjectService", () => ({ default: serviceClass({ getContext: (...args: unknown[]) => getContext(...args) }) }))
vi.mock("../../service/CodeRepositoryService", () => ({ default: serviceClass({ findById: (...args: unknown[]) => findCodeRepository(...args) }) }))

const PROJECT = "aaaaaaaaaaaaaaaaaaaaaaaa"
const DOMAIN = "bbbbbbbbbbbbbbbbbbbbbbbb"
const FOREIGN_DOMAIN = "cccccccccccccccccccccccc"
const SERVICE = "dddddddddddddddddddddddd"
const CODE_REPOSITORY = "eeeeeeeeeeeeeeeeeeeeeeee"

const tool = (name: string) => serviceTools.find(candidate => candidate.name === name)!

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

const ordersApi = { _id: SERVICE, name: "Orders API", slug: "orders-api", domainId: DOMAIN, port: 8080 }

describe("service tools", () => {
    beforeEach(() => {
        for (const mock of [listServices, getService, createService, updateService, deleteService, serviceVersions, buildService, getDomain, findCodeRepository]) {
            mock.mockReset()
        }
        principals.length = 0
    })

    it("given their definitions, when read, then reads need mfe:read, writes mfe:write and only the delete is destructive", () => {
        const reads = serviceTools.filter(definition => definition.scope === MCP_SCOPE_READ).map(definition => definition.name)
        expect(reads.sort()).toEqual(["service_get", "service_versions", "services_list"])
        for (const definition of serviceTools) {
            expect(definition.consoleOnly, definition.name).toBeFalsy()
        }
        expect(serviceTools.filter(definition => definition.annotations.destructiveHint).map(definition => definition.name)).toEqual(["service_delete"])
    })

    describe("services_list", () => {
        const services = [ordersApi, { _id: "ffffffffffffffffffffffff", slug: "billing", domainId: null }, { _id: "999999999999999999999999", slug: "legacy" }]

        it("given services, when listed without a filter, then every service of the project comes back", async () => {
            listServices.mockResolvedValue(services)

            expect(await run("services_list", {})).toEqual(services)
            expect(listServices).toHaveBeenCalledWith(PROJECT)
            expect(principals[0]).toMatchObject({ restrictedToProjectIds: [PROJECT] })
        })

        it("given services in and out of domains, when listed by domain or by none, then only the matching ones come back", async () => {
            listServices.mockResolvedValue(services)
            getDomain.mockResolvedValue({ _id: DOMAIN })

            expect(((await run("services_list", { domainId: DOMAIN })) as { slug: string }[]).map(item => item.slug)).toEqual(["orders-api"])
            expect(((await run("services_list", { domainId: DOMAIN.toUpperCase() })) as { slug: string }[]).map(item => item.slug)).toEqual(["orders-api"])
            expect(((await run("services_list", { domainId: "none" })) as { slug: string }[]).map(item => item.slug)).toEqual(["billing", "legacy"])
        })

        it("given an unknown domain, when listed by it, then it is not found rather than an empty list", async () => {
            listServices.mockResolvedValue(services)
            getDomain.mockResolvedValue(null)

            await expect(run("services_list", { domainId: FOREIGN_DOMAIN })).rejects.toBeInstanceOf(EntityNotFoundError)
        })
    })

    describe("service_get", () => {
        it("given a service of the project, when read, then it comes back with the AI context of the service, its domain and the project", async () => {
            const aiContext = {
                project: { id: PROJECT, name: "Shop" },
                domains: [],
                microfrontends: [],
                services: [{ id: SERVICE, slug: "orders-api", name: "Orders API", context: "Routes live in src/routes" }]
            }
            getContext.mockResolvedValue(aiContext)
            getService.mockResolvedValue({ ...ordersApi, toObject: () => ordersApi })

            expect(await run("service_get", { serviceId: SERVICE })).toEqual({ ...ordersApi, aiContext })
            expect(getContext).toHaveBeenCalledWith(PROJECT, { serviceId: SERVICE })
        })

        it("given a service that does not exist, when read, then it is not found", async () => {
            getService.mockResolvedValue(null)

            await expect(run("service_get", { serviceId: SERVICE })).rejects.toBeInstanceOf(EntityNotFoundError)
        })
    })

    describe("service_create", () => {
        const input = { name: "Orders API", slug: "orders-api", port: 3000, env: [{ name: "DATABASE_URL", required: true, secret: true }] }

        it("given a service in a domain of the project, when created, then the service creates it in the project", async () => {
            getDomain.mockResolvedValue({ _id: DOMAIN })
            createService.mockResolvedValue(ordersApi)

            expect(await run("service_create", { ...input, domainId: DOMAIN })).toBe(ordersApi)
            expect(createService).toHaveBeenCalledWith({ ...input, domainId: DOMAIN }, PROJECT)
        })

        it("given a domain of another project, when created, then it is refused before anything is written", async () => {
            getDomain.mockRejectedValue(new UserCannotAccessThisProjectError())

            await expect(run("service_create", { ...input, domainId: FOREIGN_DOMAIN })).rejects.toBeInstanceOf(UserCannotAccessThisProjectError)
            expect(createService).not.toHaveBeenCalled()
        })

        it("given a code repository connection of another project, when created, then it is refused before anything is written", async () => {
            findCodeRepository.mockRejectedValue(new EntityNotFoundError(CODE_REPOSITORY))

            await expect(run("service_create", { ...input, codeRepository: { enabled: true, codeRepositoryId: CODE_REPOSITORY, repositoryId: "42" } })).rejects.toBeInstanceOf(EntityNotFoundError)
            expect(createService).not.toHaveBeenCalled()
        })

        it("given a request to scaffold a repository, a version or a project id, when parsed, then they are dropped", () => {
            const parsed = tool("service_create").inputSchema.parse({
                ...input,
                version: "1.0.0",
                template: "node-api",
                projectId: PROJECT,
                codeRepository: { enabled: true, codeRepositoryId: CODE_REPOSITORY, repositoryId: "42", createData: { name: "orders-api" } }
            }) as Record<string, unknown> & { codeRepository: Record<string, unknown> }

            expect(parsed).not.toHaveProperty("version")
            expect(parsed).not.toHaveProperty("template")
            expect(parsed).not.toHaveProperty("projectId")
            expect(parsed.codeRepository).not.toHaveProperty("createData")
        })

        it("given an invalid slug, probe path, port or variable name, when validated, then it is refused", () => {
            const schema = tool("service_create").inputSchema

            expect(schema.safeParse({ ...input, slug: "-orders" }).success).toBe(false)
            expect(schema.safeParse({ ...input, livenessPath: "health" }).success).toBe(false)
            expect(schema.safeParse({ ...input, port: 70000 }).success).toBe(false)
            expect(schema.safeParse({ ...input, env: [{ name: "1BAD" }] }).success).toBe(false)
        })

        it("given base URLs, when validated, then an http(s) one per environment is accepted and any other scheme or a bad environment id is refused", () => {
            const schema = tool("service_create").inputSchema

            expect(schema.safeParse({ ...input, urls: [{ environmentId: DOMAIN, url: "https://orders.dev.acme.com" }] }).success).toBe(true)
            expect(schema.safeParse({ ...input, urls: [{ environmentId: DOMAIN, url: "ftp://orders.acme.com" }] }).success).toBe(false)
            expect(schema.safeParse({ ...input, urls: [{ environmentId: DOMAIN, url: "orders.acme.com" }] }).success).toBe(false)
            expect(schema.safeParse({ ...input, urls: [{ environmentId: DOMAIN, url: "https://orders.acme.com?tenant=a" }] }).success).toBe(false)
            expect(schema.safeParse({ ...input, urls: [{ environmentId: DOMAIN, url: "https://user:pass@orders.acme.com" }] }).success).toBe(false)
            expect(schema.safeParse({ ...input, urls: [{ environmentId: "dev", url: "https://orders.dev.acme.com" }] }).success).toBe(false)
        })
    })

    describe("service_update", () => {
        it("given new fields, when updated, then they reach the service and the slug is dropped", async () => {
            getService.mockResolvedValue(ordersApi)
            updateService.mockResolvedValue(ordersApi)

            await run("service_update", { serviceId: SERVICE, slug: "renamed", port: 9000, docsPath: null })

            expect(updateService).toHaveBeenCalledWith(SERVICE, { port: 9000, docsPath: null })
        })

        it("given a domain of another project, when updated, then it is refused before anything is written", async () => {
            getService.mockResolvedValue(ordersApi)
            getDomain.mockResolvedValue(null)

            await expect(run("service_update", { serviceId: SERVICE, domainId: FOREIGN_DOMAIN })).rejects.toBeInstanceOf(EntityNotFoundError)
            expect(updateService).not.toHaveBeenCalled()
        })

        it("given a code repository connection of another project, when updated, then it is refused before anything is written", async () => {
            getService.mockResolvedValue(ordersApi)
            findCodeRepository.mockRejectedValue(new EntityNotFoundError(CODE_REPOSITORY))

            await expect(run("service_update", { serviceId: SERVICE, codeRepository: { enabled: true, codeRepositoryId: CODE_REPOSITORY, repositoryId: "42" } })).rejects.toBeInstanceOf(
                EntityNotFoundError
            )
            expect(updateService).not.toHaveBeenCalled()
        })

        it("given null as domain, when updated, then the service is taken out of its domain", async () => {
            getService.mockResolvedValue(ordersApi)
            updateService.mockResolvedValue({ ...ordersApi, domainId: null })

            await run("service_update", { serviceId: SERVICE, domainId: null })

            expect(getDomain).not.toHaveBeenCalled()
            expect(updateService).toHaveBeenCalledWith(SERVICE, { domainId: null })
        })

        it("given a service of another project, when updated, then the refusal surfaces and nothing is written", async () => {
            getService.mockRejectedValue(new UserCannotAccessThisProjectError())

            await expect(run("service_update", { serviceId: SERVICE, port: 9000 })).rejects.toBeInstanceOf(UserCannotAccessThisProjectError)
            expect(updateService).not.toHaveBeenCalled()
        })
    })

    describe("service_delete", () => {
        it("given a service, when deleted, then the service deletes it", async () => {
            deleteService.mockResolvedValue(ordersApi)

            expect(await run("service_delete", { serviceId: SERVICE })).toBe(ordersApi)
            expect(deleteService).toHaveBeenCalledWith(SERVICE)
        })

        it("given a service of another project, when deleted, then the refusal surfaces", async () => {
            deleteService.mockRejectedValue(new UserCannotAccessThisProjectError())

            await expect(run("service_delete", { serviceId: SERVICE })).rejects.toBeInstanceOf(UserCannotAccessThisProjectError)
        })
    })

    describe("service_versions", () => {
        it("given a service, when its versions are listed, then the service's list is returned", async () => {
            serviceVersions.mockResolvedValue([{ version: "1.2.0" }])

            expect(await run("service_versions", { serviceId: SERVICE })).toEqual([{ version: "1.2.0" }])
            expect(serviceVersions).toHaveBeenCalledWith(SERVICE)
        })
    })

    describe("service_trigger_build", () => {
        it("given a version and a branch, when triggered, then the service tags the branch and it reaches outside", async () => {
            buildService.mockResolvedValue(undefined)
            getService.mockResolvedValue({ ...ordersApi, codeRepository: { enabled: true } })

            expect(await run("service_trigger_build", { serviceId: SERVICE, version: "1.3.0", branch: "develop" })).toEqual({ triggered: true })
            expect(buildService).toHaveBeenCalledWith(SERVICE, "1.3.0", "develop")
            expect(tool("service_trigger_build").annotations).toMatchObject({ openWorldHint: true, destructiveHint: false })
        })

        it("given a service without a linked repository, when triggered, then it is refused rather than answered as started", async () => {
            getService.mockResolvedValue(ordersApi)

            await expect(run("service_trigger_build", { serviceId: SERVICE, version: "1.3.0" })).rejects.toMatchObject({ code: "SERVICE_REPOSITORY_MISSING" })
            expect(buildService).not.toHaveBeenCalled()
        })

        it("given a version that cannot be a tag, when the input is validated, then it is refused", () => {
            expect(tool("service_trigger_build").inputSchema.safeParse({ serviceId: SERVICE, version: "1.3 beta" }).success).toBe(false)
        })
    })

    describe("config maps and secrets", () => {
        it("given map ids, when a service is updated, then they reach the service", async () => {
            getService.mockResolvedValue(ordersApi)
            updateService.mockResolvedValue(ordersApi)

            await run("service_update", { serviceId: SERVICE, configMapIds: [DOMAIN], secretIds: [FOREIGN_DOMAIN] })

            expect(updateService).toHaveBeenCalledWith(SERVICE, expect.objectContaining({ configMapIds: [DOMAIN], secretIds: [FOREIGN_DOMAIN] }))
        })
    })
})
