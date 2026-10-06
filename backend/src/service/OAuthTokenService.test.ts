import { SignJWT } from "jose"
import jwt from "jsonwebtoken"
import { afterEach, describe, expect, it, vi } from "vitest"
import OAuthRefreshToken from "../models/OAuthRefreshTokenModel"
import { getSecret, ISSUER } from "../models/UserModel"
import { getOAuthConfig } from "../utils/oauthConfig"
import { consumeRefreshToken, getMcpAccessTokenKey, signMcpAccessToken, verifyMcpAccessToken } from "./OAuthTokenService"

const config = getOAuthConfig({ FRONTEND_URL: "https://console.example.com", MCP_ENABLED: "true" })

const CLAIMS = {
    userId: "6890f0b1c2d3e4f5a6b7c8d9",
    clientId: "mcp_client",
    grantId: "6890f0b1c2d3e4f5a6b7c8da",
    projectId: "6890f0b1c2d3e4f5a6b7c8db",
    scopes: ["mfe:read", "mfe:write"]
}

describe("MCP access tokens", () => {
    it("given a signed token, when it is verified, then the claims come back", async () => {
        const { token, expiresIn } = await signMcpAccessToken(CLAIMS, config)

        const claims = await verifyMcpAccessToken(token, config)

        expect(expiresIn).toBe(900)
        expect(claims).toMatchObject(CLAIMS)
    })

    it("given a token, when its header is read, then it is typed as an access token and the key is not the console secret", async () => {
        const { token } = await signMcpAccessToken(CLAIMS, config)

        expect(jwt.decode(token, { complete: true })?.header.typ).toBe("at+jwt")
        expect(() => jwt.verify(token, getSecret())).toThrow()
        expect(Buffer.from(getMcpAccessTokenKey()).toString()).not.toBe(getSecret())
    })

    it("given a token minted for another resource, when it is verified here, then it is rejected (RFC 8707 audience)", async () => {
        const elsewhere = getOAuthConfig({ FRONTEND_URL: "https://console.example.com", MCP_RESOURCE_URL: "https://other.example.com/mcp" })
        const { token } = await signMcpAccessToken(CLAIMS, elsewhere)

        await expect(verifyMcpAccessToken(token, config)).rejects.toThrow(/invalid or expired/)
    })

    it("given a token from another issuer, when it is verified, then it is rejected", async () => {
        const otherIssuer = getOAuthConfig({ FRONTEND_URL: "https://console.example.com", OAUTH_ISSUER_URL: "https://auth.example.com", MCP_RESOURCE_URL: config.resource })
        const { token } = await signMcpAccessToken(CLAIMS, otherIssuer)

        await expect(verifyMcpAccessToken(token, config)).rejects.toThrow(/invalid or expired/)
    })

    it("given a console session token, when it is presented as a MCP token, then it is rejected", async () => {
        const consoleToken = jwt.sign({ id: CLAIMS.userId, email: "member@example.com", iss: ISSUER }, getSecret(), { expiresIn: "1h" })

        await expect(verifyMcpAccessToken(consoleToken, config)).rejects.toThrow(/invalid or expired/)
    })

    it("given a token with the right key but without the access token type, when verified, then it is rejected", async () => {
        const untyped = await new SignJWT({ client_id: CLAIMS.clientId, grant_id: CLAIMS.grantId, project_id: CLAIMS.projectId, scope: "mfe:read" })
            .setProtectedHeader({ alg: "HS256" })
            .setIssuer(config.issuer)
            .setAudience(config.resource)
            .setSubject(CLAIMS.userId)
            .setExpirationTime("5m")
            .sign(getMcpAccessTokenKey())

        await expect(verifyMcpAccessToken(untyped, config)).rejects.toThrow(/invalid or expired/)
    })

    it("given an expired token, when it is verified, then it is rejected", async () => {
        const expired = await new SignJWT({ client_id: CLAIMS.clientId, grant_id: CLAIMS.grantId, project_id: CLAIMS.projectId, scope: "mfe:read" })
            .setProtectedHeader({ alg: "HS256", typ: "at+jwt" })
            .setIssuer(config.issuer)
            .setAudience(config.resource)
            .setSubject(CLAIMS.userId)
            .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
            .sign(getMcpAccessTokenKey())

        await expect(verifyMcpAccessToken(expired, config)).rejects.toThrow(/invalid or expired/)
    })
})

describe("consumeRefreshToken", () => {
    afterEach(() => vi.restoreAllMocks())

    const GRANT_ID = "6890f0b1c2d3e4f5a6b7c8da"

    it("given an unused token, when consumed, then it is marked used and its grant is returned", async () => {
        vi.spyOn(OAuthRefreshToken, "findOneAndUpdate").mockResolvedValue({ _id: "token-id", grantId: GRANT_ID } as never)

        await expect(consumeRefreshToken("a-refresh-token", "mcp_client")).resolves.toEqual({ status: "consumed", grantId: GRANT_ID, tokenId: "token-id" })
    })

    it("given a token already used by the same client, when consumed again, then it is reported as reused", async () => {
        vi.spyOn(OAuthRefreshToken, "findOneAndUpdate").mockResolvedValue(null as never)
        vi.spyOn(OAuthRefreshToken, "findOne").mockResolvedValue({ grantId: GRANT_ID, clientId: "mcp_client", usedAt: new Date() } as never)

        await expect(consumeRefreshToken("a-refresh-token", "mcp_client")).resolves.toEqual({ status: "reused", grantId: GRANT_ID })
    })

    it("given a token of another client, when consumed, then it is just invalid (nobody else's grant gets revoked)", async () => {
        vi.spyOn(OAuthRefreshToken, "findOneAndUpdate").mockResolvedValue(null as never)
        vi.spyOn(OAuthRefreshToken, "findOne").mockResolvedValue({ grantId: GRANT_ID, clientId: "mcp_someone_else", usedAt: new Date() } as never)

        await expect(consumeRefreshToken("a-refresh-token", "mcp_client")).resolves.toEqual({ status: "invalid" })
    })

    it("given an unknown token, when consumed, then it is invalid", async () => {
        vi.spyOn(OAuthRefreshToken, "findOneAndUpdate").mockResolvedValue(null as never)
        vi.spyOn(OAuthRefreshToken, "findOne").mockResolvedValue(null as never)

        await expect(consumeRefreshToken("a-refresh-token", "mcp_client")).resolves.toEqual({ status: "invalid" })
    })
})
