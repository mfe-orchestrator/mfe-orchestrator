import { beforeEach, describe, expect, it, vi } from "vitest"
import { MCP_SCOPE_READ, MCP_SCOPE_WRITE } from "../../utils/oauthConfig"
import { McpSession, McpToolContext } from "../toolDefinition"
import { variableMapTools } from "./variableMapTools"

const getByProjectId = vi.fn()
const getById = vi.fn()
const create = vi.fn()
const update = vi.fn()
const remove = vi.fn()

const { kinds } = vi.hoisted(() => ({ kinds: [] as unknown[] }))

vi.mock("../../service/VariableMapService", () => ({
    VariableMapService: class {
        constructor(kind: unknown) {
            kinds.push(kind)
        }
        getByProjectId = (...args: unknown[]) => getByProjectId(...args)
        getById = (...args: unknown[]) => getById(...args)
        create = (...args: unknown[]) => create(...args)
        update = (...args: unknown[]) => update(...args)
        delete = (...args: unknown[]) => remove(...args)
    }
}))

const PROJECT = "aaaaaaaaaaaaaaaaaaaaaaaa"
const MAP = "bbbbbbbbbbbbbbbbbbbbbbbb"
const ENVIRONMENT = "cccccccccccccccccccccccc"

const tool = (name: string) => variableMapTools.find(candidate => candidate.name === name)!

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
const run = (name: string, args: Record<string, unknown> = {}) => tool(name).run(tool(name).inputSchema.parse(args) as never, context())

describe("variable map tools", () => {
    beforeEach(() => {
        for (const mock of [getByProjectId, getById, create, update, remove]) {
            mock.mockReset()
        }
        kinds.length = 0
    })

    it("given their definitions, when read, then no secret can be written and no write reaches outside: GitOps commits on deploy", () => {
        const names = variableMapTools.map(definition => definition.name)
        expect(names).not.toContain("secret_create")
        expect(names).not.toContain("secret_update")
        for (const definition of variableMapTools.filter(candidate => candidate.scope === MCP_SCOPE_WRITE)) {
            expect(definition.annotations.openWorldHint, definition.name).toBe(false)
        }
        expect(variableMapTools.filter(definition => definition.annotations.destructiveHint).map(definition => definition.name)).toEqual(["config_map_delete", "secret_delete"])
    })

    it("given a config map, when created, then the config map service creates it in the tool's project", async () => {
        const entries = [{ key: "LOG_LEVEL", values: [{ environmentId: ENVIRONMENT, value: "debug" }] }]
        create.mockResolvedValue({ _id: MAP, name: "orders", entries })

        await run("config_map_create", { name: "orders", entries })

        expect(kinds).toEqual(["configMap"])
        expect(create).toHaveBeenCalledWith({ name: "orders", entries }, PROJECT)
    })

    it("given a name that is not a DNS label, when the input is validated, then it is refused", () => {
        expect(tool("config_map_create").inputSchema.safeParse({ name: "Orders_Config" }).success).toBe(false)
    })

    it("given changes, when a config map is updated, then only the changes reach the service", async () => {
        update.mockResolvedValue({ _id: MAP })

        await run("config_map_update", { configMapId: MAP, description: "Orders settings" })

        expect(update).toHaveBeenCalledWith(MAP, { description: "Orders settings" })
    })

    it("given the secrets, when listed or read, then the secret service answers", async () => {
        getByProjectId.mockResolvedValue([])
        getById.mockResolvedValue({ _id: MAP })

        await run("secrets_list")
        await run("secret_get", { secretId: MAP })

        expect(kinds).toEqual(["secret", "secret"])
        expect(getByProjectId).toHaveBeenCalledWith(PROJECT)
        expect(getById).toHaveBeenCalledWith(MAP)
    })

    it("given a secret, when deleted, then the secret service deletes it", async () => {
        remove.mockResolvedValue({ _id: MAP })

        expect(await run("secret_delete", { secretId: MAP })).toEqual({ deleted: true })
        expect(kinds).toEqual(["secret"])
        expect(remove).toHaveBeenCalledWith(MAP)
    })
})
