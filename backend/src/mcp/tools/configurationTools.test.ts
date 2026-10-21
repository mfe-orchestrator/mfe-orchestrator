import { beforeEach, describe, expect, it, vi } from "vitest"
import { MCP_SCOPE_READ, MCP_SCOPE_WRITE } from "../../utils/oauthConfig"
import { McpSession, McpToolContext } from "../toolDefinition"
import { configurationTools } from "./configurationTools"

const getStorage = vi.fn()
const testStorage = vi.fn()
const getDatabase = vi.fn()
const testDatabase = vi.fn()

vi.mock("../../service/StorageService", () => ({
    StorageService: class {
        getById = (...args: unknown[]) => getStorage(...args)
        testConnection = (...args: unknown[]) => testStorage(...args)
    }
}))
vi.mock("../../service/DatabaseService", () => ({
    default: class {
        getById = (...args: unknown[]) => getDatabase(...args)
        testConnection = (...args: unknown[]) => testDatabase(...args)
    }
}))

const PROJECT = "aaaaaaaaaaaaaaaaaaaaaaaa"
const STORAGE = "bbbbbbbbbbbbbbbbbbbbbbbb"
const DATABASE = "cccccccccccccccccccccccc"

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
        for (const mock of [getStorage, testStorage, getDatabase, testDatabase]) {
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

    it("given a saved database, when tested, then its masked fields stand for the stored credentials and nothing is written", async () => {
        const masked = { type: "postgres", connection: { authType: "credentials", password: "••••" } }
        getDatabase.mockResolvedValue({ toFrontendObject: () => masked })
        testDatabase.mockResolvedValue({ ok: false, message: "Connection refused" })

        expect(await run("database_test", { databaseId: DATABASE })).toEqual({ ok: false, message: "Connection refused" })
        expect(testDatabase).toHaveBeenCalledWith(masked, { databaseId: DATABASE })
        expect(tool("database_test").annotations).toMatchObject({ destructiveHint: false, openWorldHint: true })
    })
})
