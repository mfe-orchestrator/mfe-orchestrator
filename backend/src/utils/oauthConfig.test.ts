import { describe, expect, it } from "vitest"
import { assertMcpConfigurationIsUsable, getOAuthConfig, parseBooleanFlag, parseTrustProxy, protectedResourceMetadataUrlFor, redactOAuthUrl } from "./oauthConfig"

describe("getOAuthConfig", () => {
    it("given only the frontend URL, when the configuration is read, then issuer and resource sit under its /api prefix", () => {
        const config = getOAuthConfig({ FRONTEND_URL: "https://console.example.com/" })

        expect(config.issuer).toBe("https://console.example.com/api")
        expect(config.resource).toBe("https://console.example.com/api/mcp")
        expect(config.protectedResourceMetadataUrl).toBe("https://console.example.com/.well-known/oauth-protected-resource/api/mcp")
        expect(config.frontendUrl).toBe("https://console.example.com")
    })

    it("given a backend on its own host, when the configuration is read, then the issuer is the backend URL", () => {
        const config = getOAuthConfig({ FRONTEND_URL: "https://console.example.com", BACKEND_URL: "https://api.example.com" })

        expect(config.issuer).toBe("https://api.example.com")
        expect(config.resource).toBe("https://api.example.com/mcp")
        expect(config.protectedResourceMetadataUrl).toBe("https://api.example.com/.well-known/oauth-protected-resource/mcp")
    })

    it("given explicit issuer and resource, when the configuration is read, then they win over the derived ones", () => {
        const config = getOAuthConfig({ FRONTEND_URL: "https://console.example.com", OAUTH_ISSUER_URL: "https://auth.example.com/", MCP_RESOURCE_URL: "https://mcp.example.com/" })

        expect(config.issuer).toBe("https://auth.example.com")
        expect(config.resource).toBe("https://mcp.example.com")
        expect(config.protectedResourceMetadataUrl).toBe("https://mcp.example.com/.well-known/oauth-protected-resource")
    })

    it("given no switches, when the configuration is read, then MCP is off while DCR and CIMD would be on, with an open CIMD host list", () => {
        const config = getOAuthConfig({ FRONTEND_URL: "https://console.example.com" })

        expect(config.enabled).toBe(false)
        expect(config.dcrEnabled).toBe(true)
        expect(config.cimdEnabled).toBe(true)
        expect(config.cimdAllowedHosts).toEqual([])
    })

    it("given the agreed lifetimes, when the configuration is read, then access lasts 15 minutes, refresh 30 days idle, a grant 90 days", () => {
        const config = getOAuthConfig({ FRONTEND_URL: "https://console.example.com" })

        expect(config.accessTokenTtlMs).toBe(15 * 60 * 1000)
        expect(config.refreshTokenIdleTtlMs).toBe(30 * 24 * 60 * 60 * 1000)
        expect(config.grantMaxTtlMs).toBe(90 * 24 * 60 * 60 * 1000)
    })

    it("given a CIMD host list, when the configuration is read, then it is trimmed and lowercased", () => {
        expect(getOAuthConfig({ CIMD_ALLOWED_HOSTS: " Claude.ai , cursor.com,," }).cimdAllowedHosts).toEqual(["claude.ai", "cursor.com"])
    })
})

describe("protectedResourceMetadataUrlFor", () => {
    it("given a resource at the origin root, when its metadata URL is built, then nothing is appended", () => {
        expect(protectedResourceMetadataUrlFor("https://mcp.example.com")).toBe("https://mcp.example.com/.well-known/oauth-protected-resource")
    })
})

const STRONG_SECRET = "9f2c4e6a8b0d1f3a5c7e9b1d3f5a7c9e"

describe("assertMcpConfigurationIsUsable", () => {
    it.each(["change-me", "CHANGEME", "your-secret-key", "secret", "short-but-unique"])("given MCP on and JWT_SECRET=%s, when the boot checks the environment, then it refuses to start", secret => {
        expect(() => assertMcpConfigurationIsUsable({ MCP_ENABLED: "true", JWT_SECRET: secret, FRONTEND_URL: "https://console.example.com" })).toThrow(/placeholder or shorter/)
    })

    it("given MCP on without JWT_SECRET, when the boot checks the environment, then it refuses to start", () => {
        expect(() => assertMcpConfigurationIsUsable({ MCP_ENABLED: "true", FRONTEND_URL: "https://console.example.com" })).toThrow(/JWT_SECRET/)
    })

    it("given MCP on without FRONTEND_URL, when the boot checks the environment, then it refuses to start", () => {
        expect(() => assertMcpConfigurationIsUsable({ MCP_ENABLED: "true", JWT_SECRET: STRONG_SECRET })).toThrow(/FRONTEND_URL/)
    })

    it("given MCP off and no secret, when the boot checks the environment, then it starts as before", () => {
        expect(() => assertMcpConfigurationIsUsable({})).not.toThrow()
    })

    it("given MCP on with a secret, when the boot checks the environment, then it starts", () => {
        expect(() => assertMcpConfigurationIsUsable({ MCP_ENABLED: "true", JWT_SECRET: STRONG_SECRET, FRONTEND_URL: "https://console.example.com" })).not.toThrow()
    })
})

describe("environment parsing", () => {
    it.each([
        ["true", true],
        ["1", true],
        ["TRUE", true],
        ["false", false],
        ["yes please", false],
        [undefined, false]
    ])("given %s, when read as a flag defaulting to off, then it is %s", (value, expected) => {
        expect(parseBooleanFlag(value, false)).toBe(expected)
    })

    it.each([
        [undefined, false],
        ["true", true],
        ["2", 2],
        ["10.0.0.0/8, 127.0.0.1", ["10.0.0.0/8", "127.0.0.1"]]
    ])("given TRUST_PROXY=%s, when parsed, then Fastify gets %j", (value, expected) => {
        expect(parseTrustProxy(value)).toEqual(expected)
    })
})

describe("redactOAuthUrl", () => {
    it("given a consent request URL, when redacted, then the handle is gone and the rest stays", () => {
        expect(redactOAuthUrl("/api/oauth/requests/s3cr3t-handle/approve")).toBe("/api/oauth/requests/[redacted]/approve")
        expect(redactOAuthUrl("/oauth/requests/s3cr3t-handle")).toBe("/oauth/requests/[redacted]")
    })

    it("given any other URL, when redacted, then it is unchanged", () => {
        expect(redactOAuthUrl("/projects/42/mcp-clients")).toBe("/projects/42/mcp-clients")
    })
})
