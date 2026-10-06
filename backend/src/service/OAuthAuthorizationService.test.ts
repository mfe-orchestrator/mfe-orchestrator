import { Model, Types } from "mongoose"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import OAuthAuthorizationCode from "../models/OAuthAuthorizationCodeModel"
import OAuthAuthorizationRequest from "../models/OAuthAuthorizationRequestModel"
import OAuthClient, { OAuthClientRegistrationType } from "../models/OAuthClientModel"
import OAuthGrant, { OAuthGrantRevocationReason } from "../models/OAuthGrantModel"
import OAuthRefreshToken from "../models/OAuthRefreshTokenModel"
import Organization from "../models/OrganizationModel"
import Project from "../models/ProjectModel"
import { IUser } from "../models/UserModel"
import UserOrganization, { RoleInOrganization } from "../models/UserOrganizationModel"
import UserProject, { RoleInProject } from "../models/UserProjectModel"
import { getOAuthConfig } from "../utils/oauthConfig"
import { computeS256Challenge, hashOpaqueToken } from "../utils/pkce"
import OAuthAuthorizationService, { consentWarnings } from "./OAuthAuthorizationService"
import { verifyMcpAccessToken } from "./OAuthTokenService"

type Row = Record<string, unknown> & { _id: Types.ObjectId }

/**
 * Just enough of a MongoDB collection for the queries the service runs: equality (ids compared as
 * strings), `null` for "missing", `$gt`, `$in` and `$or`. Each fake answers like mongoose would,
 * so what is under test is the filter the service writes, not a mock's canned answer.
 */
const matches = (row: Record<string, unknown>, filter: Record<string, unknown>): boolean =>
    Object.entries(filter).every(([key, condition]) => {
        if (key === "$or") return (condition as Record<string, unknown>[]).some(alternative => matches(row, alternative))
        const value = row[key]
        if (condition === null) return value === undefined || value === null
        if (condition instanceof Types.ObjectId || typeof condition !== "object") return String(value) === String(condition)
        const operators = condition as Record<string, unknown>
        if ("$gt" in operators) return value !== undefined && (value as Date) > (operators.$gt as Date)
        if ("$in" in operators) return (operators.$in as unknown[]).some(candidate => (Array.isArray(value) ? value.map(String).includes(String(candidate)) : String(candidate) === String(value)))
        return String(value) === String(condition)
    })

const applyUpdate = (row: Row, update: Record<string, unknown>) => {
    const { $set, $setOnInsert: _onInsert, $unset, ...plain } = update as Record<string, Record<string, unknown>>
    Object.assign(row, plain, $set ?? {})
    for (const key of Object.keys($unset ?? {})) delete row[key]
}

const sortable = <T>(value: T) => Object.assign(Promise.resolve(value), { sort: () => Promise.resolve(value) })

const fakeCollection = (model: Model<never>) => {
    const rows: Row[] = []
    const withToString = (row: Row | undefined) => row ?? null
    vi.spyOn(model, "create").mockImplementation((async (data: Record<string, unknown>) => {
        const row = { _id: new Types.ObjectId(), createdAt: new Date(), ...data } as Row
        rows.push(row)
        return row
    }) as never)
    vi.spyOn(model, "find").mockImplementation(((filter: Record<string, unknown> = {}) => sortable(rows.filter(row => matches(row, filter)))) as never)
    vi.spyOn(model, "findOne").mockImplementation((async (filter: Record<string, unknown>) => withToString(rows.find(row => matches(row, filter)))) as never)
    vi.spyOn(model, "findById").mockImplementation((async (id: unknown) => withToString(rows.find(row => String(row._id) === String(id)))) as never)
    vi.spyOn(model, "findOneAndUpdate").mockImplementation((async (filter: Record<string, unknown>, update: Record<string, unknown>, options: { new?: boolean } = {}) => {
        const row = rows.find(candidate => matches(candidate, filter))
        if (!row) return null
        const before = { ...row }
        applyUpdate(row, update)
        return options.new ? row : before
    }) as never)
    vi.spyOn(model, "findOneAndDelete").mockImplementation((async (filter: Record<string, unknown>) => {
        const index = rows.findIndex(row => matches(row, filter))
        return index === -1 ? null : rows.splice(index, 1)[0]
    }) as never)
    vi.spyOn(model, "updateOne").mockImplementation((async (filter: Record<string, unknown>, update: Record<string, unknown>) => {
        const row = rows.find(candidate => matches(candidate, filter))
        if (row) applyUpdate(row, update)
        return { modifiedCount: row ? 1 : 0 }
    }) as never)
    vi.spyOn(model, "deleteMany").mockImplementation((async (filter: Record<string, unknown>) => {
        const kept = rows.filter(row => !matches(row, filter))
        const deletedCount = rows.length - kept.length
        rows.splice(0, rows.length, ...kept)
        return { deletedCount }
    }) as never)
    return rows
}

const config = getOAuthConfig({ FRONTEND_URL: "https://console.example.com", MCP_ENABLED: "true", JWT_SECRET: "test-secret" })

const REDIRECT_URI = "http://127.0.0.1:33418/callback"
const VERIFIER = "a-perfectly-random-code-verifier-of-sufficient-length-0123456789"
const CLIENT_ID = "mcp_registered"

let clients: Row[]
let requests: Row[]
let grants: Row[]
let refreshTokens: Row[]
let projects: Row[]
let projectMemberships: Row[]
let organizationMemberships: Row[]

const aUser = (email = "member@example.com") => ({ _id: new Types.ObjectId(), email }) as unknown as IUser

const anAuthorizationQuery = (overrides: Record<string, unknown> = {}) => ({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    code_challenge: computeS256Challenge(VERIFIER),
    code_challenge_method: "S256",
    state: "client-state",
    resource: config.resource,
    ...overrides
})

const handleOf = (consentUrl: string) => new URL(consentUrl).searchParams.get("request") as string

/** A project the user is a member of with the given role, inside an organization they do not administer. */
const aProjectWithMember = (user: IUser, role: RoleInProject) => {
    const project = { _id: new Types.ObjectId(), name: "Storefront", organizationId: new Types.ObjectId() }
    projects.push(project)
    projectMemberships.push({ _id: new Types.ObjectId(), userId: user._id, projectId: project._id, role })
    return project._id.toString()
}

describe("OAuthAuthorizationService", () => {
    const service = () => new OAuthAuthorizationService(config)

    beforeEach(() => {
        clients = fakeCollection(OAuthClient as never)
        requests = fakeCollection(OAuthAuthorizationRequest as never)
        fakeCollection(OAuthAuthorizationCode as never)
        grants = fakeCollection(OAuthGrant as never)
        refreshTokens = fakeCollection(OAuthRefreshToken as never)
        projects = fakeCollection(Project as never)
        projectMemberships = fakeCollection(UserProject as never)
        organizationMemberships = fakeCollection(UserOrganization as never)
        fakeCollection(Organization as never)

        clients.push({ _id: new Types.ObjectId(), clientId: CLIENT_ID, registrationType: OAuthClientRegistrationType.DCR, clientName: "Claude Code", redirectUris: ["http://127.0.0.1:3000/callback"] })
    })

    afterEach(() => vi.restoreAllMocks())

    /** Walks the happy path up to the code, as the browser would. */
    const authorizeAndApprove = async (user: IUser, projectId: string, scopes = ["mfe:read", "mfe:write"]) => {
        const handle = handleOf(await service().startAuthorization(anAuthorizationQuery()))
        await service().getRequestForConsent(handle, user)
        const { redirectTo } = await service().approve(handle, user, { projectId, scopes })
        return new URL(redirectTo).searchParams.get("code") as string
    }

    describe("startAuthorization", () => {
        it("given an unknown client, when authorization starts, then the user lands on the console error page, never on the redirect URI", async () => {
            const location = await service().startAuthorization(anAuthorizationQuery({ client_id: "mcp_nobody" }))

            expect(location).toBe("https://console.example.com/oauth/error?code=invalid_client")
        })

        it("given a redirect URI the client never registered, when authorization starts, then the user lands on the console error page", async () => {
            const location = await service().startAuthorization(anAuthorizationQuery({ redirect_uri: "https://attacker.example.com/callback" }))

            expect(location).toBe("https://console.example.com/oauth/error?code=invalid_redirect_uri")
        })

        it("given no PKCE challenge, when authorization starts, then the client gets invalid_request with its state and the issuer", async () => {
            const location = new URL(await service().startAuthorization(anAuthorizationQuery({ code_challenge: undefined })))

            expect(location.origin + location.pathname).toBe(REDIRECT_URI)
            expect(location.searchParams.get("error")).toBe("invalid_request")
            expect(location.searchParams.get("state")).toBe("client-state")
            expect(location.searchParams.get("iss")).toBe(config.issuer)
        })

        it("given the plain PKCE method, when authorization starts, then it is refused", async () => {
            const location = new URL(await service().startAuthorization(anAuthorizationQuery({ code_challenge_method: "plain" })))

            expect(location.searchParams.get("error")).toBe("invalid_request")
        })

        it("given a resource that is not this MCP server, when authorization starts, then the client gets invalid_target", async () => {
            const location = new URL(await service().startAuthorization(anAuthorizationQuery({ resource: "https://other.example.com/mcp" })))

            expect(location.searchParams.get("error")).toBe("invalid_target")
        })

        it("given a valid request, when authorization starts, then it is parked under a hashed handle and the user goes to the consent page", async () => {
            const location = await service().startAuthorization(anAuthorizationQuery({ scope: undefined }))
            const handle = handleOf(location)

            expect(location).toMatch(/^https:\/\/console\.example\.com\/oauth\/consent\?request=/)
            expect(requests).toHaveLength(1)
            expect(requests[0].handleHash).toBe(hashOpaqueToken(handle))
            expect(requests[0].handleHash).not.toBe(handle)
            expect(requests[0].scopes).toEqual(["mfe:read", "mfe:write"])
        })
    })

    describe("consent", () => {
        it("given a parked request, when the consent page loads it, then it gets the contract shape with the client's warnings and the user's projects", async () => {
            const user = aUser()
            const projectId = aProjectWithMember(user, RoleInProject.MEMBER)
            const handle = handleOf(await service().startAuthorization(anAuthorizationQuery()))

            const consent = await service().getRequestForConsent(handle, user)

            expect(consent).toEqual({
                client: { name: "Claude Code", registrationType: "dcr", redirectHost: "127.0.0.1:33418", clientIdHost: null, warnings: ["unverified", "localhost"] },
                scopes: ["mfe:read", "mfe:write"],
                projects: [{ id: projectId, name: "Storefront", organizationName: "", role: RoleInProject.MEMBER }],
                user: { email: "member@example.com" }
            })
        })

        it("given a request already opened by someone, when another user opens it, then it does not exist for them", async () => {
            const handle = handleOf(await service().startAuthorization(anAuthorizationQuery()))
            await service().getRequestForConsent(handle, aUser())

            await expect(service().getRequestForConsent(handle, aUser("intruder@example.com"))).rejects.toThrow("Authorization request not found")
        })

        it("given an organization owner, when the projects are listed, then the organization's projects come as OWNER", async () => {
            const user = aUser()
            const organizationId = new Types.ObjectId()
            projects.push({ _id: new Types.ObjectId(), name: "Checkout", organizationId })
            organizationMemberships.push({ _id: new Types.ObjectId(), userId: user._id, organizationId, role: RoleInOrganization.OWNER })
            const handle = handleOf(await service().startAuthorization(anAuthorizationQuery()))

            const consent = await service().getRequestForConsent(handle, user)

            expect(consent.projects.map(project => project.role)).toEqual([RoleInProject.OWNER])
        })

        it("given a VIEWER approving read and write, when the grant is created, then it only carries read", async () => {
            const user = aUser()
            const projectId = aProjectWithMember(user, RoleInProject.VIEWER)

            await authorizeAndApprove(user, projectId)

            expect(grants).toHaveLength(1)
            expect(grants[0].scopes).toEqual(["mfe:read"])
        })

        it("given an approval, when the browser is sent back, then the redirect carries code, state and issuer", async () => {
            const user = aUser()
            const projectId = aProjectWithMember(user, RoleInProject.MEMBER)
            const handle = handleOf(await service().startAuthorization(anAuthorizationQuery()))
            await service().getRequestForConsent(handle, user)

            const redirect = new URL((await service().approve(handle, user, { projectId, scopes: ["mfe:read"] })).redirectTo)

            expect(redirect.searchParams.get("code")).toBeTruthy()
            expect(redirect.searchParams.get("state")).toBe("client-state")
            expect(redirect.searchParams.get("iss")).toBe(config.issuer)
            expect(requests).toHaveLength(0)
        })

        it("given a project the user cannot reach, when approving for it, then it is refused", async () => {
            const user = aUser()
            const handle = handleOf(await service().startAuthorization(anAuthorizationQuery()))
            await service().getRequestForConsent(handle, user)

            await expect(service().approve(handle, user, { projectId: new Types.ObjectId().toString(), scopes: ["mfe:read"] })).rejects.toThrow(/cannot be chosen/)
            expect(grants).toHaveLength(0)
        })

        it("given a denial, when the browser is sent back, then the client gets access_denied", async () => {
            const user = aUser()
            const handle = handleOf(await service().startAuthorization(anAuthorizationQuery()))
            await service().getRequestForConsent(handle, user)

            const redirect = new URL((await service().deny(handle, user)).redirectTo)

            expect(redirect.searchParams.get("error")).toBe("access_denied")
            expect(redirect.searchParams.get("state")).toBe("client-state")
        })
    })

    describe("token endpoint", () => {
        const exchange = (code: string, overrides: Record<string, unknown> = {}) =>
            service().exchangeAuthorizationCode({
                grant_type: "authorization_code",
                client_id: CLIENT_ID,
                code,
                redirect_uri: REDIRECT_URI,
                code_verifier: VERIFIER,
                resource: config.resource,
                ...overrides
            })

        it("given a fresh code and its verifier, when exchanged, then an access token for this resource and project comes back", async () => {
            const user = aUser()
            const projectId = aProjectWithMember(user, RoleInProject.MEMBER)
            const code = await authorizeAndApprove(user, projectId)

            const tokens = await exchange(code)
            const claims = await verifyMcpAccessToken(tokens.access_token, config)

            expect(tokens).toMatchObject({ token_type: "Bearer", expires_in: 900, scope: "mfe:read mfe:write" })
            expect(claims).toMatchObject({ userId: user._id.toString(), projectId, clientId: CLIENT_ID, scopes: ["mfe:read", "mfe:write"] })
        })

        it("given an authorize request without redirect_uri, when the code is exchanged without one, then it is accepted", async () => {
            clients[0].redirectUris = [REDIRECT_URI]
            const user = aUser()
            const projectId = aProjectWithMember(user, RoleInProject.MEMBER)
            const handle = handleOf(await service().startAuthorization(anAuthorizationQuery({ redirect_uri: undefined })))
            await service().getRequestForConsent(handle, user)
            const code = new URL((await service().approve(handle, user, { projectId, scopes: ["mfe:read"] })).redirectTo).searchParams.get("code") as string

            await expect(exchange(code, { redirect_uri: undefined })).resolves.toMatchObject({ token_type: "Bearer" })
        })

        it("given an authorize request with redirect_uri, when the code is exchanged without it, then it is refused", async () => {
            const user = aUser()
            const code = await authorizeAndApprove(user, aProjectWithMember(user, RoleInProject.MEMBER))

            await expect(exchange(code, { redirect_uri: undefined })).rejects.toThrow(/invalid, expired/)
        })

        it("given the wrong verifier, when the code is exchanged, then it is refused", async () => {
            const user = aUser()
            const code = await authorizeAndApprove(user, aProjectWithMember(user, RoleInProject.MEMBER))

            await expect(exchange(code, { code_verifier: "x".repeat(64) })).rejects.toThrow(/invalid, expired/)
        })

        it("given a code exchanged once, when it is exchanged again, then it is refused and the grant it produced is revoked", async () => {
            const user = aUser()
            const code = await authorizeAndApprove(user, aProjectWithMember(user, RoleInProject.MEMBER))
            await exchange(code)

            await expect(exchange(code)).rejects.toThrow(/authorization code is invalid/)
            expect(grants[0].revokedReason).toBe(OAuthGrantRevocationReason.CODE_REUSE)
            expect(refreshTokens).toHaveLength(0)
        })

        it("given a refresh token, when it is used, then a new pair comes back and the old token is spent", async () => {
            const user = aUser()
            const tokens = await exchange(await authorizeAndApprove(user, aProjectWithMember(user, RoleInProject.MEMBER)))

            const refreshed = await service().refresh({ grant_type: "refresh_token", client_id: CLIENT_ID, refresh_token: tokens.refresh_token })

            expect(refreshed.refresh_token).not.toBe(tokens.refresh_token)
            expect(refreshTokens.filter(token => token.usedAt)).toHaveLength(1)
        })

        it("given a refresh token used twice, when the replay arrives, then the whole grant is revoked", async () => {
            const user = aUser()
            const tokens = await exchange(await authorizeAndApprove(user, aProjectWithMember(user, RoleInProject.MEMBER)))
            const rotated = await service().refresh({ client_id: CLIENT_ID, refresh_token: tokens.refresh_token })

            await expect(service().refresh({ client_id: CLIENT_ID, refresh_token: tokens.refresh_token })).rejects.toThrow(/refresh token is invalid/)
            expect(grants[0].revokedReason).toBe(OAuthGrantRevocationReason.REFRESH_TOKEN_REUSE)
            await expect(service().refresh({ client_id: CLIENT_ID, refresh_token: rotated.refresh_token })).rejects.toThrow()
        })

        it("given a member demoted to VIEWER, when the client refreshes, then the new token only carries read", async () => {
            const user = aUser()
            const projectId = aProjectWithMember(user, RoleInProject.MEMBER)
            const tokens = await exchange(await authorizeAndApprove(user, projectId))
            projectMemberships[0].role = RoleInProject.VIEWER

            const refreshed = await service().refresh({ client_id: CLIENT_ID, refresh_token: tokens.refresh_token })

            expect(refreshed.scope).toBe("mfe:read")
        })

        it("given a member removed from the project, when the client refreshes, then it is refused and the grant revoked", async () => {
            const user = aUser()
            const tokens = await exchange(await authorizeAndApprove(user, aProjectWithMember(user, RoleInProject.MEMBER)))
            projectMemberships.splice(0)

            await expect(service().refresh({ client_id: CLIENT_ID, refresh_token: tokens.refresh_token })).rejects.toThrow(/no longer valid/)
            expect(grants[0].revokedReason).toBe(OAuthGrantRevocationReason.MEMBERSHIP_LOST)
        })

        it("given a refresh token, when the client revokes it, then the grant is revoked", async () => {
            const user = aUser()
            const tokens = await exchange(await authorizeAndApprove(user, aProjectWithMember(user, RoleInProject.MEMBER)))

            await service().revoke({ token: tokens.refresh_token })

            expect(grants[0].revokedReason).toBe(OAuthGrantRevocationReason.CLIENT)
        })
    })
})

describe("consentWarnings", () => {
    const cimd = (clientId: string) => ({ registrationType: OAuthClientRegistrationType.CIMD, clientId })

    it("given a CIMD client with no allow-list configured, when warned about, then it is unverified", () => {
        expect(consentWarnings(cimd("https://claude.ai/oauth/client.json"), "https://claude.ai/api/mcp/auth_callback", [])).toEqual(["unverified"])
    })

    it("given a CIMD client whose host is allow-listed and redirects home, when warned about, then nothing is flagged", () => {
        expect(consentWarnings(cimd("https://claude.ai/oauth/client.json"), "https://claude.ai/api/mcp/auth_callback", ["claude.ai"])).toEqual([])
    })

    it("given a CIMD client redirecting to a subdomain of its host, when warned about, then it is not a mismatch", () => {
        expect(consentWarnings(cimd("https://example.com/client.json"), "https://app.example.com/cb", ["example.com"])).toEqual([])
    })

    it("given a CIMD client redirecting to another site, when warned about, then the mismatch is flagged", () => {
        expect(consentWarnings(cimd("https://claude.ai.evil.example/client.json"), "https://collector.example.net/cb", [])).toEqual(["unverified", "redirect_host_mismatch"])
    })

    it("given a CIMD client redirecting to loopback, when warned about, then localhost is flagged rather than a mismatch", () => {
        expect(consentWarnings(cimd("https://vscode.dev/client.json"), "http://127.0.0.1:33418/cb", ["vscode.dev"])).toEqual(["localhost"])
    })

    it("given a DCR client, when warned about, then it is unverified whatever the allow-list", () => {
        expect(consentWarnings({ registrationType: OAuthClientRegistrationType.DCR, clientId: "mcp_x" }, "https://claude.ai/cb", ["claude.ai"])).toEqual(["unverified"])
    })
})
