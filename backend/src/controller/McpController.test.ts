import RateLimit from "@fastify/rate-limit"
import Fastify, { FastifyInstance } from "fastify"
import jwt from "jsonwebtoken"
import { Types } from "mongoose"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

// Reached through the API key lookup (plugins/autorization -> UserService), which reads the app
// instance from the entry point: importing that would start the server.
vi.mock("..", () => ({ fastify: { log: { warn: vi.fn() } } }))

const grantState = vi.hoisted(() => ({ scopes: ["mfe:read"] as string[] | undefined }))

vi.mock("../service/OAuthGrantService", () => ({
    authenticateGrant: async () => (grantState.scopes ? { grant: {}, role: "MEMBER", scopes: grantState.scopes } : undefined)
}))
vi.mock("../models/UserModel", async importOriginal => {
    const original = await importOriginal<typeof import("../models/UserModel")>()
    return {
        ...original,
        default: { findById: async (id: string) => ({ toObject: () => ({ _id: id, email: "member@example.com" }) }) }
    }
})

import { authenticateMcpRequest } from "../mcp/authentication"
import ApiKey, { ApiKeyRole, ApiKeyStatus } from "../models/ApiKeyModel"
import Environment from "../models/EnvironmentModel"
import { getSecret, ISSUER } from "../models/UserModel"
import { signMcpAccessToken } from "../service/OAuthTokenService"
import { clearApiKeyCredentialCache } from "../utils/apiKeyCredentialCache"
import { getOAuthConfig } from "../utils/oauthConfig"
import mcpController from "./McpController"

const ENVIRONMENT = { MCP_ENABLED: "true", FRONTEND_URL: "https://console.example.com", JWT_SECRET: "a-test-secret", MCP_RATE_LIMIT_MAX: "20" }
const PROTOCOL_HEADERS = { accept: "application/json, text/event-stream", "content-type": "application/json", "mcp-protocol-version": "2025-06-18" }

let app: FastifyInstance
const previousEnvironment: Record<string, string | undefined> = {}

const aToken = async (scopes: string[]) =>
    (
        await signMcpAccessToken({
            userId: "6890f0b1c2d3e4f5a6b7c8d9",
            clientId: "mcp_client",
            grantId: "6890f0b1c2d3e4f5a6b7c8da",
            projectId: "6890f0b1c2d3e4f5a6b7c8db",
            scopes
        })
    ).token

/** A stateless request answers either with plain JSON or with a single SSE frame: read both. */
const readJsonRpc = (body: string) => {
    const data = body
        .split("\n")
        .filter(line => line.startsWith("data: "))
        .map(line => line.slice("data: ".length))
    return JSON.parse(data.length > 0 ? data[data.length - 1] : body)
}

const callMcp = (authorization: string | undefined, method: string, params: Record<string, unknown> = {}, extraHeaders: Record<string, string> = {}) =>
    app.inject({
        method: "POST",
        url: "/mcp",
        headers: { ...PROTOCOL_HEADERS, ...(authorization && { authorization }), ...extraHeaders },
        payload: { jsonrpc: "2.0", id: 1, method, params }
    })

const listToolNames = async (scopes: string[]) => {
    const response = await callMcp(`Bearer ${await aToken(scopes)}`, "tools/list")
    expect(response.statusCode).toBe(200)
    return (readJsonRpc(response.body).result.tools as { name: string }[]).map(tool => tool.name)
}

describe("McpController", () => {
    beforeAll(async () => {
        for (const [key, value] of Object.entries(ENVIRONMENT)) {
            previousEnvironment[key] = process.env[key]
            process.env[key] = value
        }
        app = Fastify()
        // Without the global per-IP limit: what is under test is the per-credential one
        await app.register(RateLimit, { global: false })
        await app.register(mcpController)
        await app.ready()
    })

    afterAll(async () => {
        await app.close()
        for (const [key, value] of Object.entries(previousEnvironment)) {
            if (value === undefined) delete process.env[key]
            else process.env[key] = value
        }
    })

    beforeEach(() => {
        grantState.scopes = ["mfe:read"]
        clearApiKeyCredentialCache()
        // No API keys in this installation: a non-JWT bearer is tried as one and found nowhere
        vi.spyOn(ApiKey, "find").mockResolvedValue([] as never)
    })

    it("given no token, when /mcp is called, then it answers 401 pointing at the protected resource metadata", async () => {
        const response = await callMcp(undefined, "tools/list")

        expect(response.statusCode).toBe(401)
        expect(response.headers["www-authenticate"]).toBe(`Bearer resource_metadata="https://console.example.com/.well-known/oauth-protected-resource/api/mcp", scope="mfe:read mfe:write"`)
    })

    it("given a token that is not one, when /mcp is called, then the challenge says invalid_token", async () => {
        const response = await callMcp("Bearer not-a-token", "tools/list")

        expect(response.statusCode).toBe(401)
        expect(response.headers["www-authenticate"]).toMatch(/^Bearer error="invalid_token"/)
    })

    it("given a console session token, when /mcp is called with it, then it is refused", async () => {
        const consoleToken = jwt.sign({ id: "6890f0b1c2d3e4f5a6b7c8d9", email: "member@example.com", iss: ISSUER }, getSecret(), { expiresIn: "1h" })

        const response = await callMcp(`Bearer ${consoleToken}`, "tools/list")

        expect(response.statusCode).toBe(401)
    })

    it("given a token whose grant was revoked, when /mcp is called, then it is refused on that very call", async () => {
        const token = await aToken(["mfe:read"])
        grantState.scopes = undefined

        const response = await callMcp(`Bearer ${token}`, "tools/list")

        expect(response.statusCode).toBe(401)
        expect(response.headers["www-authenticate"]).toMatch(/invalid_token/)
    })

    it("given a GET or DELETE, when /mcp is called, then it answers 405: the server keeps no session", async () => {
        expect((await app.inject({ method: "GET", url: "/mcp" })).statusCode).toBe(405)
        expect((await app.inject({ method: "DELETE", url: "/mcp" })).statusCode).toBe(405)
    })

    it("given a read-only token, when the tools are listed, then only read tools are there", async () => {
        const names = await listToolNames(["mfe:read"])

        expect(names).toContain("microfrontends_list")
        expect(names).not.toContain("deploy")
        expect(names).not.toContain("microfrontend_create")
    })

    it("given a read-write token, when the tools are listed, then write tools are there too, with their annotations", async () => {
        grantState.scopes = ["mfe:read", "mfe:write"]
        const response = await callMcp(`Bearer ${await aToken(["mfe:read", "mfe:write"])}`, "tools/list")
        const tools = readJsonRpc(response.body).result.tools as { name: string; annotations: Record<string, unknown> }[]

        expect(tools.find(tool => tool.name === "deploy")?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true })
    })

    it("given a token saying write for a user now capped to read, when the tools are listed, then write tools are gone", async () => {
        grantState.scopes = ["mfe:read"]

        const names = await listToolNames(["mfe:read", "mfe:write"])

        expect(names).not.toContain("deploy")
    })

    it("given a read-only token, when a write tool is called by name anyway, then it does not run", async () => {
        const response = await callMcp(`Bearer ${await aToken(["mfe:read"])}`, "tools/call", { name: "deploy", arguments: { environmentIds: ["6890f0b1c2d3e4f5a6b7c8dc"] } })
        const message = readJsonRpc(response.body)

        expect(message.error ?? message.result?.isError).toBeTruthy()
    })

    it("given the configured resource, when the test environment is read back, then it is the one the challenge advertised", () => {
        expect(getOAuthConfig().resource).toBe("https://console.example.com/api/mcp")
    })
})

describe("McpController with a project API key", () => {
    const PROJECT_A = new Types.ObjectId().toString()
    const PROJECT_B = new Types.ObjectId().toString()

    interface StoredKey {
        _id: Types.ObjectId
        plaintext: string
        projectId: string
        role: ApiKeyRole
        status: ApiKeyStatus
        expiresAt: Date
        compareApiKey: (candidate: string) => Promise<boolean>
    }

    let keys: StoredKey[]
    let apiKeyLookups: number

    const aKey = (plaintext: string, overrides: Partial<Omit<StoredKey, "plaintext" | "compareApiKey">> = {}): StoredKey => ({
        _id: new Types.ObjectId(),
        plaintext,
        projectId: PROJECT_A,
        role: ApiKeyRole.MANAGER,
        status: ApiKeyStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 3_600_000),
        compareApiKey: (candidate: string) => Promise.resolve(candidate === plaintext),
        ...overrides
    })

    beforeAll(async () => {
        for (const [key, value] of Object.entries(ENVIRONMENT)) {
            previousEnvironment[key] = process.env[key]
            process.env[key] = value
        }
        app = Fastify()
        await app.register(RateLimit, { global: false })
        await app.register(mcpController)
        await app.ready()
    })

    afterAll(async () => {
        await app.close()
        vi.restoreAllMocks()
    })

    beforeEach(() => {
        clearApiKeyCredentialCache()
        apiKeyLookups = 0
        keys = []
        grantState.scopes = ["mfe:read", "mfe:write"]
        // Answers the queries resolveApiKey writes, as checkApiKey's own tests do
        vi.spyOn(ApiKey, "find").mockImplementation(((filter: Record<string, unknown>) => {
            apiKeyLookups++
            const now = new Date()
            const usable = filter.status === ApiKeyStatus.ACTIVE
            return Promise.resolve(keys.filter(key => (key.status === ApiKeyStatus.ACTIVE && key.expiresAt > now) === usable))
        }) as never)
    })

    const toolNames = async (headers: { authorization?: string; apiKey?: string }) => {
        const response = await callMcp(headers.authorization, "tools/list", {}, headers.apiKey ? { "api-key": headers.apiKey } : {})
        expect(response.statusCode).toBe(200)
        return (readJsonRpc(response.body).result.tools as { name: string }[]).map(tool => tool.name)
    }

    it("given a MANAGER key as a bearer, when the tools are listed, then read and write tools are there", async () => {
        keys.push(aKey("11111111-2222-3333-4444-555555555555"))

        const names = await toolNames({ authorization: "Bearer 11111111-2222-3333-4444-555555555555" })

        expect(names).toContain("microfrontends_list")
        expect(names).toContain("deploy")
    })

    it("given a key in the api-key header, when the tools are listed, then it is accepted too", async () => {
        keys.push(aKey("a-key-in-a-header"))

        expect(await toolNames({ apiKey: "a-key-in-a-header" })).toContain("microfrontends_list")
    })

    it("given a VIEWER key, when the tools are listed, then only read tools are there", async () => {
        keys.push(aKey("a-viewer-key", { role: ApiKeyRole.VIEWER }))

        const names = await toolNames({ authorization: "Bearer a-viewer-key" })

        expect(names).toContain("microfrontends_list")
        expect(names).not.toContain("deploy")
        expect(names).not.toContain("microfrontend_create")
    })

    it("given a key of project A, when a tool targets an environment of project B, then it is not found", async () => {
        keys.push(aKey("project-a-key"))
        const environmentOfB = new Types.ObjectId().toString()
        vi.spyOn(Environment, "findOne").mockImplementation((() => ({ session: () => Promise.resolve({ _id: environmentOfB, projectId: PROJECT_B }) })) as never)

        const response = await callMcp("Bearer project-a-key", "tools/call", { name: "deployments_list", arguments: { environmentId: environmentOfB } })
        const result = readJsonRpc(response.body).result

        expect(result.isError).toBe(true)
        expect(result.content[0].text).toBe("Not found in this project")
    })

    it("given a key of project A, when a tool reads its own project, then it runs without any user membership", async () => {
        keys.push(aKey("project-a-key"))
        const find = vi.spyOn(Environment, "find").mockImplementation((() => ({ sort: () => Promise.resolve([]) })) as never)

        const response = await callMcp("Bearer project-a-key", "tools/call", { name: "environments_list", arguments: {} })

        expect(readJsonRpc(response.body).result.isError).toBeFalsy()
        expect(String((find.mock.calls[0][0] as unknown as Record<string, unknown>).projectId)).toBe(PROJECT_A)
    })

    it.each([
        ["revoked", { status: ApiKeyStatus.INACTIVE }],
        ["expired", { expiresAt: new Date(Date.now() - 60_000) }]
    ])("given a %s key, when /mcp is called with it, then it is refused", async (_case, overrides) => {
        keys.push(aKey("a-dead-key", overrides))

        const response = await callMcp("Bearer a-dead-key", "tools/list")

        expect(response.statusCode).toBe(401)
        expect(response.headers["www-authenticate"]).toMatch(/invalid_token/)
    })

    it("given a key just checked, when it is used again, then the bcrypt lookup is not repeated", async () => {
        keys.push(aKey("a-busy-key"))

        await toolNames({ authorization: "Bearer a-busy-key" })
        const lookupsAfterFirstCall = apiKeyLookups
        await toolNames({ authorization: "Bearer a-busy-key" })

        expect(lookupsAfterFirstCall).toBe(1)
        expect(apiKeyLookups).toBe(1)
    })

    it("given API keys switched off, when a valid key is presented, then it is refused", async () => {
        keys.push(aKey("a-valid-key"))
        const switchedOff = getOAuthConfig({ ...ENVIRONMENT, MCP_API_KEY_ENABLED: "false" })

        await expect(authenticateMcpRequest({ authorization: "Bearer a-valid-key" }, switchedOff)).resolves.toEqual({ error: "invalid_token" })
        expect(apiKeyLookups).toBe(0)
    })

    it("given API keys switched off, when the endpoint is called with a key, then it answers 401", async () => {
        keys.push(aKey("a-valid-key"))
        process.env.MCP_API_KEY_ENABLED = "false"
        const strict = Fastify()
        await strict.register(mcpController)
        await strict.ready()
        delete process.env.MCP_API_KEY_ENABLED

        const response = await strict.inject({
            method: "POST",
            url: "/mcp",
            headers: { ...PROTOCOL_HEADERS, authorization: "Bearer a-valid-key" },
            payload: { jsonrpc: "2.0", id: 1, method: "tools/list" }
        })
        await strict.close()

        expect(response.statusCode).toBe(401)
    })

    it("given a console session token, when it is presented, then it is refused without being tried as an API key", async () => {
        const consoleToken = jwt.sign({ id: "6890f0b1c2d3e4f5a6b7c8d9", email: "member@example.com", iss: ISSUER }, getSecret(), { expiresIn: "1h" })

        const response = await callMcp(`Bearer ${consoleToken}`, "tools/list")

        expect(response.statusCode).toBe(401)
        expect(apiKeyLookups).toBe(0)
    })

    it("given one key over its per-minute budget, when it keeps calling, then it gets 429 while other credentials are untouched", async () => {
        keys.push(aKey("a-runaway-key"), aKey("a-calm-key"))

        const statuses: number[] = []
        for (let call = 0; call < 21; call++) {
            statuses.push((await callMcp("Bearer a-runaway-key", "tools/list")).statusCode)
        }

        expect(statuses.slice(0, 20).every(status => status === 200)).toBe(true)
        expect(statuses[20]).toBe(429)
        expect((await callMcp("Bearer a-calm-key", "tools/list")).statusCode).toBe(200)
    })
})
