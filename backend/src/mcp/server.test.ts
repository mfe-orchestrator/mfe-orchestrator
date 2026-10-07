import { describe, expect, it } from "vitest"
import { createBusinessException } from "../errors/BusinessException"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import UserCannotAccessThisEnvironmentError from "../errors/UserCannotAccessThisEnvironmentError"
import UserCannotAccessThisProjectError from "../errors/UserCannotAccessThisProjectError"
import { MCP_SCOPE_READ, MCP_SCOPE_WRITE } from "../utils/oauthConfig"
import { describeToolError, MCP_TOOLS, NOT_FOUND_IN_PROJECT, registeredInputSchema, selectProject } from "./server"
import { McpSession } from "./toolDefinition"

const toolNamed = (name: string) => MCP_TOOLS.find(tool => tool.name === name)

describe("MCP tool registry", () => {
    it("given every tool, when the names are compared, then they are unique and snake_case", () => {
        const names = MCP_TOOLS.map(tool => tool.name)

        expect(new Set(names).size).toBe(names.length)
        for (const name of names) {
            expect(name).toMatch(/^[a-z][a-z0-9_]*$/)
        }
    })

    it("given every tool, when its scope and annotations are compared, then read tools are read-only and everything else needs mfe:write", () => {
        for (const tool of MCP_TOOLS) {
            if (tool.scope === MCP_SCOPE_READ) {
                expect(tool.annotations, tool.name).toMatchObject({ readOnlyHint: true })
                expect(tool.annotations.destructiveHint, tool.name).toBeFalsy()
            } else {
                expect(tool.scope, tool.name).toBe(MCP_SCOPE_WRITE)
                expect(tool.annotations.readOnlyHint, tool.name).toBe(false)
            }
        }
    })

    it.each([
        "deploy",
        "deployment_rollback",
        "microfrontend_delete",
        "environment_delete",
        "global_variable_delete",
        "storage_delete",
        "code_repository_delete",
        "dependencies_alignment_apply",
        "integration_apply"
    ])("given %s, when its annotations are read, then it is marked destructive", name => {
        expect(toolNamed(name)?.annotations.destructiveHint).toBe(true)
    })

    it.each(["code_repository_branches", "build_status_get", "dependencies_report", "microfrontend_trigger_build", "integration_apply"])(
        "given %s, which reaches a git provider or npm, when read, then it is open world",
        name => {
            expect(toolNamed(name)?.annotations.openWorldHint).toBe(true)
        }
    )

    it("given the tools left out of v1, when the registry is searched, then none of them is there", () => {
        const excluded =
            /api_?key|project_(create|delete)|organization_(create|update|delete)|member|invit|user_profile|profile|upload|position|dimension|storage_(create|update)|code_repository_(create|update|add)|scaffold/
        expect(MCP_TOOLS.map(tool => tool.name).filter(name => excluded.test(name))).toEqual([])
    })

    it("given the organization tools, when read, then they are read-only and span the shared projects instead of picking one", () => {
        for (const name of ["organizations_list", "organization_get", "projects_list"]) {
            const tool = toolNamed(name)
            expect(tool?.scope, name).toBe(MCP_SCOPE_READ)
            expect(tool?.annotations.readOnlyHint, name).toBe(true)
            expect(tool?.projectScoped, name).toBe(false)
            expect(Object.keys(registeredInputSchema(tool!).shape), name).not.toContain("projectId")
        }
    })

    it("given a project tool, when its registered input is read, then it has an optional projectId", () => {
        const schema = registeredInputSchema(toolNamed("microfrontends_list")!)

        expect(schema.safeParse({}).success).toBe(true)
        expect(schema.safeParse({ projectId: "6890f0b1c2d3e4f5a6b7c8d9" }).success).toBe(true)
        expect(schema.safeParse({ projectId: "not-an-id" }).success).toBe(false)
    })

    it("given every tool, when its own input is inspected, then none declares a project id itself: the shared set decides", () => {
        for (const tool of MCP_TOOLS) {
            expect(Object.keys(tool.inputSchema.shape), tool.name).not.toContain("projectId")
        }
    })

    it("given a microfrontend creation that asks to scaffold a repository, when the input is parsed, then createData is dropped", () => {
        const parsed = toolNamed("microfrontend_create")?.inputSchema.parse({
            name: "Cart",
            slug: "cart",
            version: "1.0.0",
            codeRepository: { enabled: true, codeRepositoryId: "6890f0b1c2d3e4f5a6b7c8d9", repositoryId: "42", createData: { name: "cart", template: "react-vite" } }
        }) as { codeRepository: Record<string, unknown> }

        expect(parsed.codeRepository).not.toHaveProperty("createData")
    })

    it("given an update carrying a project id, when the input is parsed, then the project id is dropped", () => {
        const parsed = toolNamed("microfrontend_update")?.inputSchema.parse({ microfrontendId: "6890f0b1c2d3e4f5a6b7c8d9", projectId: "6890f0b1c2d3e4f5a6b7c8da", name: "Cart" })

        expect(parsed).not.toHaveProperty("projectId")
    })
})

describe("describeToolError", () => {
    it("given an error of the console's own, when described, then its message reaches the client", () => {
        expect(describeToolError(createBusinessException({ code: "X", message: "Slug already taken" }))).toBe("Slug already taken")
    })

    it("given an id of another project or one that does not exist, when described, then the client cannot tell them apart", () => {
        const user = { email: "member@example.com" } as never

        expect(describeToolError(new EntityNotFoundError("42"))).toBe(NOT_FOUND_IN_PROJECT)
        expect(describeToolError(new UserCannotAccessThisProjectError(user))).toBe(NOT_FOUND_IN_PROJECT)
        expect(describeToolError(new UserCannotAccessThisEnvironmentError(user))).toBe(NOT_FOUND_IN_PROJECT)
    })

    it("given any other error, when described, then the client gets a generic message", () => {
        expect(describeToolError(new Error("connection to 10.0.0.12:27017 refused"))).toBe("The operation failed. Check the console for details.")
    })
})

describe("selectProject", () => {
    const session = (...projectIds: string[]) => ({ projects: projectIds.map(projectId => ({ projectId, role: "MEMBER" })) }) as unknown as McpSession

    it("given a single shared project, when no projectId is passed, then that project is used", () => {
        expect(selectProject(session("a"), undefined).projectId).toBe("a")
    })

    it("given two shared projects, when no projectId is passed, then the client is told to pass one and where to find them", () => {
        expect(() => selectProject(session("a", "b"), undefined)).toThrow(/shares 2 projects: pass projectId\. Call projects_list/)
    })

    it("given two shared projects, when one of them is passed, then it is used", () => {
        expect(selectProject(session("a", "b"), "b").projectId).toBe("b")
    })

    it("given a project outside the shared set, when it is passed, then it is refused", () => {
        expect(() => selectProject(session("a", "b"), "c")).toThrow(/not shared with this connection/)
    })
})
