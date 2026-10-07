import { FastifyInstance, FastifyRequest } from "fastify"
import { exportJWK, generateKeyPair, JSONWebKeySet, SignJWT } from "jose"
import jwt from "jsonwebtoken"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

// Reached through UserService, which reads the app instance from the entry point:
// importing that entry point would start the server.
vi.mock("..", () => ({ fastify: { log: { warn: vi.fn() } } }))

const apiKeyFind = vi.fn()
vi.mock("../models/ApiKeyModel", async importOriginal => {
    const original = await importOriginal<typeof import("../models/ApiKeyModel")>()
    return { ...original, default: { find: (...args: unknown[]) => apiKeyFind(...args) } }
})

/**
 * The keys Entra ID would publish for the tenant. The remote key set is swapped for a local one,
 * so verification runs for real (signature, issuer, audience) without reaching Microsoft.
 */
const entraTenantKeys = vi.hoisted(() => ({ jwks: { keys: [] } as unknown }))
vi.mock("jose", async importOriginal => {
    const original = await importOriginal<typeof import("jose")>()
    return {
        ...original,
        createRemoteJWKSet: () => (header: Parameters<ReturnType<typeof original.createLocalJWKSet>>[0], token: Parameters<ReturnType<typeof original.createLocalJWKSet>>[1]) =>
            original.createLocalJWKSet(entraTenantKeys.jwks as JSONWebKeySet)(header, token)
    }
})

/** A Redis that already holds a profile under the victim's `sub`, as the old cache would have. */
const cache = vi.hoisted(() => ({ entries: new Map<string, string>(), reads: [] as string[] }))
vi.mock("./redis", () => ({
    redisClient: {
        get: async (key: string) => {
            cache.reads.push(key)
            return cache.entries.get(key) ?? null
        },
        set: async (key: string, value: string) => {
            cache.entries.set(key, value)
        }
    }
}))
const userinfo = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock("axios", () => ({ default: { get: userinfo.get } }))

import { ApiKeyStatus } from "../models/ApiKeyModel"
import { getSecret, ISSUER } from "../models/UserModel"
import { signMcpAccessToken } from "../service/OAuthTokenService"
import { getOAuthConfig } from "../utils/oauthConfig"
import { checkApiKey, ensureGoogleAudience, getFederatedAuthenticationMoment, resolveAuthentication } from "./autorization"

const ENTRA_TENANT_ID = "11111111-2222-3333-4444-555555555555"
const entraIssuer = (tenantId: string) => `https://login.microsoftonline.com/${tenantId}/v2.0`

const ENTRA_CLIENT_ID = "console-spa-client-id"
const AUTH0_DOMAIN = "tenant.eu.auth0.com"
const AUTH0_AUDIENCE = "https://api.console.example.com"
const GOOGLE_CLIENT_ID = "console.apps.googleusercontent.com"

const anInstallation = (azureEntraIdTenantId?: string) =>
    ({
        config: { AZURE_ENTRAID_TENANT_ID: azureEntraIdTenantId, AZURE_ENTRAID_CLIENT_ID: ENTRA_CLIENT_ID, GOOGLE_CLIENT_ID, AUTH0_DOMAIN, AUTH0_AUDIENCE }
    }) as unknown as FastifyInstance

let tenantPrivateKey: CryptoKey
let anotherPrivateKey: CryptoKey

beforeAll(async () => {
    const tenant = await generateKeyPair("RS256")
    tenantPrivateKey = tenant.privateKey
    anotherPrivateKey = (await generateKeyPair("RS256")).privateKey
    entraTenantKeys.jwks = { keys: [{ ...(await exportJWK(tenant.publicKey)), kid: "tenant-key", alg: "RS256" }] }
})

/** An Entra ID token as Microsoft would sign it: RS256, with the key id of the tenant's key set. */
const aSignedEntraToken = (options: { key?: CryptoKey; audience?: string; issuer?: string } = {}) =>
    new SignJWT({ preferred_username: "member@example.com", name: "Member" })
        .setProtectedHeader({ alg: "RS256", kid: "tenant-key" })
        .setIssuer(options.issuer ?? entraIssuer(ENTRA_TENANT_ID))
        .setAudience(options.audience ?? ENTRA_CLIENT_ID)
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(options.key ?? tenantPrivateKey)

const aLocalToken = () => jwt.sign({ email: "member@example.com", id: "6890f0b1c2d3e4f5a6b7c8d9", iss: ISSUER }, getSecret(), { expiresIn: "1h" })

/** For the paths that only decode the token (issuer routing, timestamps): the key is irrelevant there. */
const anEntraToken = (issuer: string, claims: Record<string, unknown> = {}) =>
    jwt.sign({ preferred_username: "member@example.com", name: "Member", iss: issuer, ...claims }, "any-key", { expiresIn: "1h" })

describe("resolveAuthentication", () => {
    it("given a token issued by this platform, when the request asks for a federated issuer in the header, then the access is not federated", async () => {
        const resolved = await resolveAuthentication(anInstallation(ENTRA_TENANT_ID), aLocalToken(), "an-external-provider")

        expect(resolved).toEqual({
            user: { email: "member@example.com", id: "6890f0b1c2d3e4f5a6b7c8d9" },
            isFederated: false
        })
    })

    it("given an Entra ID token signed by the tenant, when its tenant is the configured one, then the access is federated", async () => {
        const resolved = await resolveAuthentication(anInstallation(ENTRA_TENANT_ID), await aSignedEntraToken(), ISSUER)

        expect(resolved).toEqual({
            user: { email: "member@example.com", name: "Member" },
            isFederated: true
        })
    })

    it("given an Entra ID token for the right tenant but signed by someone else, when the authentication is resolved, then it is rejected", async () => {
        const forged = await aSignedEntraToken({ key: anotherPrivateKey })

        await expect(resolveAuthentication(anInstallation(ENTRA_TENANT_ID), forged, ISSUER)).rejects.toThrow("Invalid Entra ID token")
    })

    it("given an Entra ID token issued to another application, when the authentication is resolved, then it is rejected", async () => {
        const foreign = await aSignedEntraToken({ audience: "another-application" })

        await expect(resolveAuthentication(anInstallation(ENTRA_TENANT_ID), foreign, ISSUER)).rejects.toThrow("Invalid Entra ID token")
    })

    it("given a MCP access token, when it is presented as a console session, then nothing is resolved", async () => {
        const { token } = await signMcpAccessToken(
            { userId: "6890f0b1c2d3e4f5a6b7c8d9", clientId: "mcp_client", grantId: "6890f0b1c2d3e4f5a6b7c8da", projectIds: ["6890f0b1c2d3e4f5a6b7c8db"], scopes: ["mfe:read"] },
            getOAuthConfig({ FRONTEND_URL: "https://console.example.com" })
        )

        await expect(resolveAuthentication(anInstallation(ENTRA_TENANT_ID), token, ISSUER)).resolves.toBeUndefined()
    })

    it("given a token signed with the console secret but typed as an access token, when it is resolved, then it is rejected", async () => {
        const accessTyped = jwt.sign({ email: "member@example.com", iss: ISSUER }, getSecret(), { expiresIn: "1h", header: { alg: "HS256", typ: "at+jwt" } })

        await expect(resolveAuthentication(anInstallation(ENTRA_TENANT_ID), accessTyped, ISSUER)).rejects.toThrow(/MCP server/)
    })

    it("given a token signed with the console secret but carrying an audience, when it is resolved, then it is rejected", async () => {
        const withAudience = jwt.sign({ email: "member@example.com", iss: ISSUER, aud: "https://console.example.com/api/mcp" }, getSecret(), { expiresIn: "1h" })

        await expect(resolveAuthentication(anInstallation(ENTRA_TENANT_ID), withAudience, ISSUER)).rejects.toThrow(/MCP server/)
    })

    it("given an installation with no Entra ID tenant, when a token states an empty tenant issuer, then it is not accepted", async () => {
        const resolved = await resolveAuthentication(anInstallation(), anEntraToken(entraIssuer("")), ISSUER)

        expect(resolved).toBeUndefined()
    })

    it("given a token from an unknown issuer, when the authentication is resolved, then nothing is resolved", async () => {
        const resolved = await resolveAuthentication(anInstallation(ENTRA_TENANT_ID), anEntraToken("https://an-issuer-we-never-configured.example"), ISSUER)

        expect(resolved).toBeUndefined()
    })

    it("given an expired token, when the authentication is resolved, then it is rejected", async () => {
        const expired = jwt.sign({ email: "member@example.com", iss: ISSUER }, getSecret(), { expiresIn: -60 })

        await expect(resolveAuthentication(anInstallation(ENTRA_TENANT_ID), expired, ISSUER)).rejects.toThrow(/expired/i)
    })
})

describe("Auth0 tokens", () => {
    const VICTIM = "auth0|victim"

    /** An Auth0 access token as the tenant signs it, for the console's API audience. */
    const anAuth0Token = (options: { key?: CryptoKey; audience?: string } = {}) =>
        new SignJWT({})
            .setProtectedHeader({ alg: "RS256", kid: "tenant-key" })
            .setIssuer(`https://${AUTH0_DOMAIN}/`)
            .setAudience(options.audience ?? [AUTH0_AUDIENCE, `https://${AUTH0_DOMAIN}/userinfo`])
            .setSubject(VICTIM)
            .setIssuedAt()
            .setExpirationTime("1h")
            .sign(options.key ?? tenantPrivateKey)

    beforeEach(() => {
        cache.entries.clear()
        cache.reads = []
        cache.entries.set(VICTIM, JSON.stringify({ email: "victim@example.com" }))
        userinfo.get.mockReset()
        userinfo.get.mockResolvedValue({ data: { email: "victim@example.com", family_name: "Victim", given_name: "V" } })
    })

    it("given an unsigned token naming a user whose profile is cached, when it is resolved, then it is rejected before the cache is read", async () => {
        const unsigned = jwt.sign({ sub: VICTIM, iss: `https://${AUTH0_DOMAIN}/`, aud: AUTH0_AUDIENCE }, "", { algorithm: "none", expiresIn: "1h" })

        await expect(resolveAuthentication(anInstallation(), unsigned, "auth0")).rejects.toThrow("Invalid Auth0 token")
        expect(cache.reads).toEqual([])
        expect(userinfo.get).not.toHaveBeenCalled()
    })

    it("given a token signed by another key, when it is resolved, then it is rejected", async () => {
        await expect(resolveAuthentication(anInstallation(), await anAuth0Token({ key: anotherPrivateKey }), "auth0")).rejects.toThrow("Invalid Auth0 token")
    })

    it("given a token issued for another API, when it is resolved, then it is rejected", async () => {
        await expect(resolveAuthentication(anInstallation(), await anAuth0Token({ audience: "https://someone-else.example.com" }), "auth0")).rejects.toThrow("Invalid Auth0 token")
    })

    it("given a token of the tenant for this API, when it is resolved, then the profile comes from userinfo and is cached under the token's hash", async () => {
        const token = await anAuth0Token()

        const resolved = await resolveAuthentication(anInstallation(), token, "auth0")

        expect(resolved).toEqual({ user: expect.objectContaining({ email: "victim@example.com" }), isFederated: true })
        expect([...cache.entries.keys()].filter(key => key.startsWith("auth0:"))).toHaveLength(1)
        expect([...cache.entries.keys()].some(key => key.includes(token))).toBe(false)
    })

    it("given an installation without AUTH0_AUDIENCE, when an Auth0 token is resolved, then it is refused", async () => {
        const withoutAudience = { config: { AUTH0_DOMAIN } } as unknown as FastifyInstance

        await expect(resolveAuthentication(withoutAudience, await anAuth0Token(), "auth0")).rejects.toThrow(/AUTH0_AUDIENCE/)
    })
})

describe("ensureGoogleAudience", () => {
    it("given tokeninfo for this application, when the audience is checked, then it passes", () => {
        expect(() => ensureGoogleAudience(anInstallation(), { audience: GOOGLE_CLIENT_ID, email: "member@example.com" })).not.toThrow()
    })

    it("given tokeninfo for another application, when the audience is checked, then it is rejected", () => {
        expect(() => ensureGoogleAudience(anInstallation(), { audience: "someone-else.apps.googleusercontent.com" })).toThrow(/not issued to this application/)
    })

    it("given an installation without Google login, when any audience is checked, then it is rejected", () => {
        const withoutGoogle = { config: {} } as unknown as FastifyInstance

        expect(() => ensureGoogleAudience(withoutGoogle, { audience: GOOGLE_CLIENT_ID })).toThrow(/not issued to this application/)
    })
})

describe("getFederatedAuthenticationMoment", () => {
    it("given a token stating both claims, when the moment is read, then the interactive sign-in wins over the issue time", () => {
        const signedInAt = new Date("2026-08-11T09:30:00.000Z")

        const moment = getFederatedAuthenticationMoment(anEntraToken(entraIssuer(ENTRA_TENANT_ID), { auth_time: signedInAt.getTime() / 1000 }))

        expect(moment).toEqual(signedInAt)
    })

    it("given a token stating only the issue time, when the moment is read, then the issue time is used", () => {
        const token = anEntraToken(entraIssuer(ENTRA_TENANT_ID))
        const issuedAtSeconds = (jwt.decode(token, { json: true })?.iat as number) * 1000

        expect(getFederatedAuthenticationMoment(token)).toEqual(new Date(issuedAtSeconds))
    })

    it("given an opaque token, when the moment is read, then there is none", () => {
        expect(getFederatedAuthenticationMoment("ya29.an-opaque-google-access-token")).toBeUndefined()
    })

    it("given a token stating neither claim, when the moment is read, then there is none", () => {
        const withoutTimestamps = jwt.sign({ email: "member@example.com" }, "any-key", { noTimestamp: true })

        expect(getFederatedAuthenticationMoment(withoutTimestamps)).toBeUndefined()
    })
})

describe("checkApiKey", () => {
    const PROJECT_ID = "6890f0b1c2d3e4f5a6b7c8d9"
    const aRequest = (apiKey?: string) => ({ headers: apiKey ? { "api-key": apiKey } : {}, query: {} }) as unknown as FastifyRequest

    /**
     * The stored key is a bcrypt hash, so the stub matches on the plaintext it was built
     * with rather than pretending to hash anything.
     */
    const aStoredKey = (plaintext: string, overrides: { status?: ApiKeyStatus; expiresAt?: Date } = {}) => ({
        projectId: PROJECT_ID,
        status: overrides.status ?? ApiKeyStatus.ACTIVE,
        expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60_000),
        compareApiKey: (candidate: string) => Promise.resolve(candidate === plaintext)
    })

    /** Answers each query the way Mongo would, so the filter itself is what is under test. */
    const storing = (...keys: ReturnType<typeof aStoredKey>[]) => {
        apiKeyFind.mockImplementation((filter: Record<string, unknown> = {}) => {
            const now = new Date()
            const usable = filter.status === ApiKeyStatus.ACTIVE
            return Promise.resolve(keys.filter(key => (key.status === ApiKeyStatus.ACTIVE && key.expiresAt > now) === usable))
        })
    }

    beforeEach(() => apiKeyFind.mockReset())

    it("given an active key inside its expiry, when it is checked, then the project it belongs to is returned", async () => {
        storing(aStoredKey("a-live-key"))

        await expect(checkApiKey(aRequest("a-live-key"))).resolves.toBe(PROJECT_ID)
    })

    it("given a revoked key, when it is checked, then it is refused as revoked", async () => {
        storing(aStoredKey("a-revoked-key", { status: ApiKeyStatus.INACTIVE }))

        await expect(checkApiKey(aRequest("a-revoked-key"))).rejects.toThrow("API key revoked")
    })

    it("given a key past its expiry, when it is checked, then it is refused as expired", async () => {
        storing(aStoredKey("a-stale-key", { expiresAt: new Date(Date.now() - 60_000) }))

        await expect(checkApiKey(aRequest("a-stale-key"))).rejects.toThrow(/API key expired on/)
    })

    it("given a key nobody issued, when it is checked, then it is refused without naming a reason", async () => {
        storing(aStoredKey("a-live-key"))

        await expect(checkApiKey(aRequest("a-key-we-never-issued"))).rejects.toThrow("API key not found")
    })

    it("given no key at all in the request, when it is checked, then the database is not even consulted", async () => {
        storing(aStoredKey("a-live-key"))

        await expect(checkApiKey(aRequest())).rejects.toThrow("API key not found")
        expect(apiKeyFind).not.toHaveBeenCalled()
    })

    it("given a revoked key and a live one, when the live one is checked, then the revoked one does not shadow it", async () => {
        storing(aStoredKey("a-revoked-key", { status: ApiKeyStatus.INACTIVE }), aStoredKey("a-live-key"))

        await expect(checkApiKey(aRequest("a-live-key"))).resolves.toBe(PROJECT_ID)
    })
})
