import { beforeEach, describe, expect, it, vi } from "vitest"
import { MCP_SCOPE_READ } from "../../utils/oauthConfig"
import { MCP_TOOLS } from "../server"
import { McpSession, McpToolContext } from "../toolDefinition"
import { domainDeploymentTools } from "./domainDeploymentTools"

const getByDomainId = vi.fn()
const getByProjectId = vi.fn()

// Hoisted with the mock below, which builds its service class with it
const { principals } = vi.hoisted(() => ({ principals: [] as unknown[] }))

vi.mock("../../service/DomainDeploymentService", () => ({
    default: class {
        constructor(principal: unknown) {
            principals.push(principal)
        }
        getByDomainId = (...args: unknown[]) => getByDomainId(...args)
        getByProjectId = (...args: unknown[]) => getByProjectId(...args)
    }
}))

const PROJECT = "aaaaaaaaaaaaaaaaaaaaaaaa"
const DOMAIN = "bbbbbbbbbbbbbbbbbbbbbbbb"

const tool = domainDeploymentTools.find(candidate => candidate.name === "domain_deployments_get")!

const context = (): McpToolContext => {
    const session: McpSession = {
        principal: { _id: "user-1", email: "user@example.com" } as never,
        projects: [{ projectId: PROJECT, role: "MEMBER" }],
        scopes: [MCP_SCOPE_READ],
        credential: { kind: "console", userId: "user-1" }
    }
    return { principal: { ...session.principal, restrictedToProjectIds: [PROJECT] }, projectId: PROJECT, scopes: session.scopes, credential: session.credential, session }
}

/** Runs the tool on its parsed input, as the MCP server and the assistant do. */
const run = (args: Record<string, unknown>) => tool.run(tool.inputSchema.parse(args) as never, context())

describe("domain deployment tools", () => {
    beforeEach(() => {
        getByDomainId.mockReset()
        getByProjectId.mockReset()
        principals.length = 0
    })

    it("given its definition, when read, then it is a read-only mfe:read tool registered on the MCP server that says where each version comes from", () => {
        expect(tool.scope).toBe(MCP_SCOPE_READ)
        expect(tool.annotations).toMatchObject({ readOnlyHint: true })
        expect(tool.annotations.destructiveHint).toBeFalsy()
        expect(tool.consoleOnly).toBeFalsy()
        expect(tool.description).toContain("active deployment")
        expect(tool.description).toContain("deploy pipeline reported")
        expect(MCP_TOOLS.map(definition => definition.name)).toContain("domain_deployments_get")
    })

    it("given a domain id, when called, then the deployments of that domain come back", async () => {
        const deployments = { domain: { _id: DOMAIN, name: "Checkout", slug: "checkout" }, environments: [] }
        getByDomainId.mockResolvedValue(deployments)

        expect(await run({ domainId: DOMAIN })).toEqual(deployments)
        expect(getByDomainId).toHaveBeenCalledWith(DOMAIN)
        expect(getByProjectId).not.toHaveBeenCalled()
        expect(principals[0]).toMatchObject({ restrictedToProjectIds: [PROJECT] })
    })

    it("given no domain id, when called, then the matrix of the project of the token comes back", async () => {
        const matrix = [{ domain: null, environments: [] }]
        getByProjectId.mockResolvedValue(matrix)

        expect(await run({})).toEqual(matrix)
        expect(getByProjectId).toHaveBeenCalledWith(PROJECT)
        expect(getByDomainId).not.toHaveBeenCalled()
    })

    it("given an id that is not one, when called, then the input is refused", () => {
        expect(() => tool.inputSchema.parse({ domainId: "checkout" })).toThrow()
    })
})
