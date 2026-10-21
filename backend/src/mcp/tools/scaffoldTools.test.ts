import { beforeEach, describe, expect, it, vi } from "vitest"
import { EntityNotFoundError } from "../../errors/EntityNotFoundError"
import { McpSession, McpToolContext, requiresConfirmation } from "../toolDefinition"
import { scaffoldTools } from "./scaffoldTools"

const createMicrofrontend = vi.fn()
const getTemplate = vi.fn()
const findCodeRepository = vi.fn()

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
vi.mock("../../service/MarketService", () => ({ default: serviceClass({ getSingle: (...args: unknown[]) => getTemplate(...args) }) }))
vi.mock("../../service/CodeRepositoryService", () => ({ default: serviceClass({ findById: (...args: unknown[]) => findCodeRepository(...args) }) }))

const PROJECT = "aaaaaaaaaaaaaaaaaaaaaaaa"
const MICROFRONTEND = "cccccccccccccccccccccccc"
const CODE_REPOSITORY = "dddddddddddddddddddddddd"

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
        for (const mock of [createMicrofrontend, getTemplate, findCodeRepository]) {
            mock.mockReset()
        }
    })

    it("given their definitions, when read, then MCP clients get them and the console assistant asks before creating a repository", () => {
        expect(scaffoldTools.map(definition => definition.name).sort()).toEqual(["microfrontend_scaffold"])
        expect(tool("microfrontend_scaffold").inputSchema.shape.repositoryName.description).toContain("-fe")
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
})
