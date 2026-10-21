import { beforeEach, describe, expect, it, vi } from "vitest"
import { MCP_SCOPE_READ, MCP_SCOPE_WRITE } from "../../utils/oauthConfig"
import { McpSession, McpToolContext } from "../toolDefinition"
import { configurationTools } from "./configurationTools"

const getStorage = vi.fn()
const testStorage = vi.fn()

vi.mock("../../service/StorageService", () => ({
    StorageService: class {
        getById = (...args: unknown[]) => getStorage(...args)
        testConnection = (...args: unknown[]) => testStorage(...args)
    }
}))

const PROJECT = "aaaaaaaaaaaaaaaaaaaaaaaa"
const STORAGE = "bbbbbbbbbbbbbbbbbbbbbbbb"

const tool = (name: string) => configurationTools.find(candidate => candidate.name === name)!

const context = (): McpToolContext => {
    const session: McpSession = {
        principal: { _id: "user-1", email: "user@example.com" } as never,
        projects: [{ projectId: PROJECT, role: "MEMBER" }],
        scopes: [MCP_SCOPE_READ, MCP_SCOPE_WRITE],
        credential: { kind: "console", userId: "user-1" }
    }
    return { principal: { ...session.principal, restrictedToProjectIds: [PROJECT] }, projectId: PROJECT, scopes: session.scopes, credential: session.credential, session }
}

const run = (name: string, args: Record<string, unknown>) => tool(name).run(tool(name).inputSchema.parse(args) as never, context())

describe("connection test tools", () => {
    beforeEach(() => {
        for (const mock of [getStorage, testStorage]) {
            mock.mockReset()
        }
    })

    it("given a saved storage, when tested, then its masked fields stand for the stored credentials and nothing is written", async () => {
        const masked = { type: "AWS", authConfig: { accessKeyId: "AKIA", secretAccessKey: "••••" } }
        getStorage.mockResolvedValue({ toFrontendObject: () => masked })
        testStorage.mockResolvedValue({ ok: true })

        expect(await run("storage_test", { storageId: STORAGE })).toEqual({ ok: true })
        expect(testStorage).toHaveBeenCalledWith(masked, { storageId: STORAGE })
        expect(tool("storage_test").annotations).toMatchObject({ destructiveHint: false, openWorldHint: true })
    })
})
