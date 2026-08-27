import { FastifyInstance, FastifyRequest } from "fastify"
import jwt from "jsonwebtoken"
import { beforeEach, describe, expect, it, vi } from "vitest"

// Reached through UserService, which reads the app instance from the entry point:
// importing that entry point would start the server.
vi.mock("..", () => ({ fastify: { log: { warn: vi.fn() } } }))

const apiKeyFind = vi.fn()
vi.mock("../models/ApiKeyModel", async importOriginal => {
    const original = await importOriginal<typeof import("../models/ApiKeyModel")>()
    return { ...original, default: { find: (...args: unknown[]) => apiKeyFind(...args) } }
})

import { ApiKeyStatus } from "../models/ApiKeyModel"
import { getSecret, ISSUER } from "../models/UserModel"
import { checkApiKey, getFederatedAuthenticationMoment, resolveAuthentication } from "./autorization"

const ENTRA_TENANT_ID = "11111111-2222-3333-4444-555555555555"
const entraIssuer = (tenantId: string) => `https://login.microsoftonline.com/${tenantId}/v2.0`

const anInstallation = (azureEntraIdTenantId?: string) =>
    ({
        config: { AZURE_ENTRAID_TENANT_ID: azureEntraIdTenantId }
    }) as unknown as FastifyInstance

const aLocalToken = () => jwt.sign({ email: "member@example.com", id: "6890f0b1c2d3e4f5a6b7c8d9", iss: ISSUER }, getSecret(), { expiresIn: "1h" })

/** An Entra ID token is only decoded, never verified, so the signing key is irrelevant. */
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

    it("given an Entra ID token, when its tenant is the configured one, then the access is federated", async () => {
        const resolved = await resolveAuthentication(anInstallation(ENTRA_TENANT_ID), anEntraToken(entraIssuer(ENTRA_TENANT_ID)), ISSUER)

        expect(resolved).toEqual({
            user: { email: "member@example.com", name: "Member" },
            isFederated: true
        })
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
