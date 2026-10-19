import { beforeEach, describe, expect, it, vi } from "vitest"
import { EntityNotFoundError } from "../../errors/EntityNotFoundError"
import { McpSession, McpToolContext, requiresConfirmation } from "../toolDefinition"
import { scaffoldTools } from "./scaffoldTools"

const createMicrofrontend = vi.fn()
const createService = vi.fn()
const getTemplate = vi.fn()
const findCodeRepository = vi.fn()
const getDomain = vi.fn()

// Hoisted with the mocks below, which build their service classes with it
const { serviceClass } = vi.hoisted(() => ({
    serviceClass: (methods: Record<string, unknown>) =>
        class {
            constructor() {
                Object.assign(this, methods)
            }
        }
}))

vi.mock("../../service/MicrofrontendService", () => ({ default: serviceClass({ create: (...args: unknown[]) => createMicrofrontend(...args) }) }))
vi.mock("../../service/ServiceService", () => ({ default: serviceClass({ create: (...args: unknown[]) => createService(...args) }) }))
vi.mock("../../service/MarketService", () => ({ default: serviceClass({ getSingle: (...args: unknown[]) => getTemplate(...args) }) }))
vi.mock("../../service/CodeRepositoryService", () => ({ default: serviceClass({ findById: (...args: unknown[]) => findCodeRepository(...args) }) }))
vi.mock("../../service/DomainService", () => ({ default: serviceClass({ getById: (...args: unknown[]) => getDomain(...args) }) }))

const PROJECT = "aaaaaaaaaaaaaaaaaaaaaaaa"
const DOMAIN = "bbbbbbbbbbbbbbbbbbbbbbbb"
const MICROFRONTEND = "cccccccccccccccccccccccc"
const CODE_REPOSITORY = "dddddddddddddddddddddddd"
const SERVICE = "eeeeeeeeeeeeeeeeeeeeeeee"

const tool = (name: string) => scaffoldTools.find(candidate => candidate.name === name)!

const context = (): McpToolContext => {
    const session: McpSession = {
        principal: { _id: "user-1", email: "user@example.com" } as never,
        projects: [{ projectId: PROJECT, role: "MEMBER" }],
        scopes: ["mfe:read", "mfe:write"],
        credential: { kind: "console", userId: "user-1" }
    }
    return { principal: { ...session.principal, restrictedToProjectIds: [PROJECT] }, projectId: PROJECT, scopes: session.scopes, credential: session.credential, session }
}

/** Runs the tool on its parsed input, as the MCP server and the assistant do. */
const run = (name: string, args: Record<string, unknown>) => tool(name).run(tool(name).inputSchema.parse(args) as never, context())

describe("scaffold tools", () => {
    beforeEach(() => {
        for (const mock of [createMicrofrontend, createService, getTemplate, findCodeRepository, getDomain]) {
            mock.mockReset()
        }
    })

    it("given their definitions, when read, then MCP clients get them and the console assistant asks before creating a repository", () => {
        expect(scaffoldTools.map(definition => definition.name).sort()).toEqual(["microfrontend_scaffold", "service_scaffold"])
        expect(tool("microfrontend_scaffold").inputSchema.shape.repositoryName.description).toContain("-fe")
        expect(tool("service_scaffold").inputSchema.shape.repositoryName.description).toContain("-be")
        for (const definition of scaffoldTools) {
            expect(definition.consoleOnly, definition.name).toBeFalsy()
            expect(definition.scope, definition.name).toBe("mfe:write")
            expect(definition.annotations.openWorldHint, definition.name).toBe(true)
            expect(requiresConfirmation(definition), definition.name).toBe(true)
        }
    })

    describe("microfrontend_scaffold", () => {
        const input = { name: "Cart", slug: "cart", version: "1.0.0", template: "react-vite", codeRepositoryId: CODE_REPOSITORY, private: true }

        it("given a template and a connection of the project, when scaffolded, then the microfrontend is created with the repository to create", async () => {
            findCodeRepository.mockResolvedValue({ _id: CODE_REPOSITORY })
            getTemplate.mockResolvedValue({ slug: "react-vite" })
            createMicrofrontend.mockResolvedValue({ _id: MICROFRONTEND, slug: "cart" })

            expect(await run("microfrontend_scaffold", input)).toEqual({ _id: MICROFRONTEND, slug: "cart" })
            expect(findCodeRepository).toHaveBeenCalledWith(CODE_REPOSITORY)
            expect(createMicrofrontend).toHaveBeenCalledWith(
                {
                    name: "Cart",
                    slug: "cart",
                    version: "1.0.0",
                    codeRepository: {
                        enabled: true,
                        codeRepositoryId: CODE_REPOSITORY,
                        repositoryId: "",
                        gitlab: undefined,
                        createData: { name: "cart", private: true, template: "react-vite" }
                    }
                },
                PROJECT
            )
        })

        it("given a connection of another project, when scaffolded, then it is refused before anything is created", async () => {
            findCodeRepository.mockRejectedValue(new EntityNotFoundError(CODE_REPOSITORY))

            await expect(run("microfrontend_scaffold", input)).rejects.toBeInstanceOf(EntityNotFoundError)
            expect(createMicrofrontend).not.toHaveBeenCalled()
        })

        it("given an unknown template, when scaffolded, then it is refused before any repository is created", async () => {
            findCodeRepository.mockResolvedValue({ _id: CODE_REPOSITORY })
            getTemplate.mockResolvedValue(null)

            await expect(run("microfrontend_scaffold", input)).rejects.toMatchObject({ code: "TEMPLATE_NOT_FOUND" })
            expect(createMicrofrontend).not.toHaveBeenCalled()
        })
    })

    describe("service_scaffold", () => {
        const input = { name: "Orders API", slug: "orders-api", domainId: DOMAIN, template: "node-fastify", codeRepositoryId: CODE_REPOSITORY, repositoryName: "orders-be" }

        it("given a template, a connection and a domain of the project, when scaffolded, then the service is created in the domain with the repository to create", async () => {
            findCodeRepository.mockResolvedValue({ _id: CODE_REPOSITORY })
            getDomain.mockResolvedValue({ _id: DOMAIN })
            getTemplate.mockResolvedValue({ slug: "node-fastify" })
            createService.mockResolvedValue({ _id: SERVICE, slug: "orders-api" })

            expect(await run("service_scaffold", input)).toEqual({ _id: SERVICE, slug: "orders-api" })
            expect(createService).toHaveBeenCalledWith(
                {
                    name: "Orders API",
                    slug: "orders-api",
                    domainId: DOMAIN,
                    codeRepository: {
                        enabled: true,
                        codeRepositoryId: CODE_REPOSITORY,
                        repositoryId: "",
                        gitlab: undefined,
                        createData: { name: "orders-be", private: undefined, template: "node-fastify" }
                    }
                },
                PROJECT
            )
        })

        it("given a domain of another project, when scaffolded, then it is refused before any repository is created", async () => {
            findCodeRepository.mockResolvedValue({ _id: CODE_REPOSITORY })
            getDomain.mockResolvedValue(null)

            await expect(run("service_scaffold", input)).rejects.toBeInstanceOf(EntityNotFoundError)
            expect(createService).not.toHaveBeenCalled()
        })

        it("given an unknown template, when scaffolded, then it is refused before any repository is created", async () => {
            findCodeRepository.mockResolvedValue({ _id: CODE_REPOSITORY })
            getDomain.mockResolvedValue({ _id: DOMAIN })
            getTemplate.mockResolvedValue(null)

            await expect(run("service_scaffold", input)).rejects.toMatchObject({ code: "TEMPLATE_NOT_FOUND" })
            expect(createService).not.toHaveBeenCalled()
        })

        it("given a repository name the providers refuse, when parsed, then it is refused", () => {
            expect(tool("service_scaffold").inputSchema.safeParse({ ...input, repositoryName: "orders be" }).success).toBe(false)
            expect(tool("service_scaffold").inputSchema.safeParse({ ...input, repositoryName: "orders-be.git" }).success).toBe(false)
        })

        it("given an existing repository to link instead, when parsed, then it is not taken: service_create links one", () => {
            const parsed = tool("service_scaffold").inputSchema.parse({ ...input, codeRepository: { enabled: true, codeRepositoryId: CODE_REPOSITORY, repositoryId: "42" } })

            expect(parsed).not.toHaveProperty("codeRepository")
        })
    })
})
