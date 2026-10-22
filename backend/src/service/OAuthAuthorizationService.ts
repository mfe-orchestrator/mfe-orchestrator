import { FastifyBaseLogger } from "fastify"
import { createBusinessException } from "../errors/BusinessException"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import OAuthError from "../errors/OAuthError"
import OAuthAuthorizationCode from "../models/OAuthAuthorizationCodeModel"
import OAuthAuthorizationRequest from "../models/OAuthAuthorizationRequestModel"
import OAuthClient, { OAuthClientRegistrationType } from "../models/OAuthClientModel"
import OAuthGrant, { OAuthGrantRevocationReason } from "../models/OAuthGrantModel"
import OAuthRefreshToken from "../models/OAuthRefreshTokenModel"
import Organization from "../models/OrganizationModel"
import Project from "../models/ProjectModel"
import { IUser } from "../models/UserModel"
import UserOrganization, { ORGANIZATION_ADMIN_ROLES } from "../models/UserOrganizationModel"
import UserProject, { RoleInProject } from "../models/UserProjectModel"
import { toObjectId } from "../utils/mongooseUtils"
import { getOAuthConfig, MCP_SCOPES, OAuthConfig } from "../utils/oauthConfig"
import { generateOpaqueToken, hashOpaqueToken, isValidCodeChallenge, verifyPkce } from "../utils/pkce"
import { describeRedirectHost, matchesRegisteredRedirectUri, RedirectUriWarning, redirectUriWarnings } from "../utils/redirectUriPolicy"
import OAuthClientService from "./OAuthClientService"
import { authenticateGrant, capScopesToRole, createGrant, projectIdsOfGrant, resolveProjectRole, revokeGrant } from "./OAuthGrantService"

export const MAX_GRANT_PROJECTS = 50

import { consumeRefreshToken, issueRefreshToken, signMcpAccessToken, verifyMcpAccessToken } from "./OAuthTokenService"

/** An authorization code stays in the database this long, to recognise a replay after its expiry. */
const CODE_RETENTION_MS = 5 * 60 * 1000

export type ConsentWarning = "unverified" | "redirect_host_mismatch" | RedirectUriWarning

const hostnameOf = (uri: string): string | undefined => {
    try {
        return new URL(uri).hostname.toLowerCase()
    } catch {
        return undefined
    }
}

/**
 * What the consent page should warn about for this client and redirect URI.
 *
 * A DCR client's metadata is self-asserted, so it is always unverified. A CIMD client is identified
 * by the domain serving its metadata, which proves control of that domain and nothing more: anyone
 * can publish a document naming itself "Claude". It counts as verified only when the operator listed
 * its host in CIMD_ALLOWED_HOSTS; with no list, every CIMD client is unverified too. When the code
 * would land on an https host other than the one vouching for the client, that is flagged as well,
 * the shape of a phishing client borrowing a trusted name.
 */
export const consentWarnings = (client: { registrationType: OAuthClientRegistrationType; clientId: string }, redirectUri: string, cimdAllowedHosts: string[]): ConsentWarning[] => {
    const warnings: ConsentWarning[] = []
    const clientIdHost = client.registrationType === OAuthClientRegistrationType.CIMD ? hostnameOf(client.clientId) : undefined

    if (client.registrationType === OAuthClientRegistrationType.DCR || !clientIdHost || !cimdAllowedHosts.includes(clientIdHost)) {
        warnings.push("unverified")
    }

    const redirectWarnings = redirectUriWarnings(redirectUri)
    const redirectHost = hostnameOf(redirectUri)
    // Loopback and private-use schemes are flagged on their own; a host mismatch only means something on the web
    if (clientIdHost && redirectWarnings.length === 0 && redirectHost && redirectHost !== clientIdHost && !redirectHost.endsWith(`.${clientIdHost}`)) {
        warnings.push("redirect_host_mismatch")
    }

    return [...warnings, ...redirectWarnings]
}

/** What the consent page shows. The shape is the contract with the frontend: keep it stable. */
export interface ConsentRequestDTO {
    client: {
        name: string
        registrationType: OAuthClientRegistrationType
        redirectHost: string
        /** Host of a CIMD client's `client_id` URL, the domain vouching for it. null for DCR clients. */
        clientIdHost: string | null
        warnings: ConsentWarning[]
    }
    scopes: string[]
    projects: { id: string; name: string; organizationId: string; organizationName: string; role: RoleInProject }[]
    user: { email: string }
}

export interface TokenResponse {
    access_token: string
    token_type: "Bearer"
    expires_in: number
    refresh_token: string
    scope: string
}

const asString = (value: unknown): string | undefined => (typeof value === "string" && value.length > 0 ? value : undefined)

const withoutTrailingSlash = (url: string) => url.replace(/\/+$/, "")

/** Appends OAuth response parameters to a redirect URI, keeping the query it already has. */
const buildRedirect = (redirectUri: string, params: Record<string, string | undefined>): string => {
    const url = new URL(redirectUri)
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
            url.searchParams.set(key, value)
        }
    }
    return url.toString()
}

export class OAuthAuthorizationService {
    private readonly clients: OAuthClientService

    constructor(
        private readonly config: OAuthConfig = getOAuthConfig(),
        log?: FastifyBaseLogger
    ) {
        this.clients = new OAuthClientService(config, log)
    }

    private consentErrorPage(code: string): string {
        return `${this.config.frontendUrl}/oauth/error?code=${encodeURIComponent(code)}`
    }

    /** The RFC 9207 `iss` parameter travels with every response to the client, errors included. */
    private redirectToClient(redirectUri: string, params: Record<string, string | undefined>): string {
        return buildRedirect(redirectUri, { ...params, iss: this.config.issuer })
    }

    private isOwnResource(resource: string): boolean {
        return withoutTrailingSlash(resource) === this.config.resource
    }

    /**
     * Validates an authorization request and parks it for the consent page.
     *
     * Order matters (RFC 6749 §4.1.2.1): until the client and its redirect URI are known good the
     * user is sent to the console's error page, never to the redirect URI, otherwise the endpoint
     * would redirect anywhere on request. Past that point errors go back to the client.
     */
    async startAuthorization(query: Record<string, unknown>): Promise<string> {
        const client = await this.clients.resolveClient(query.client_id)
        if (!client) {
            return this.consentErrorPage("invalid_client")
        }

        const requestedRedirect = asString(query.redirect_uri) ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : undefined)
        if (!requestedRedirect || !matchesRegisteredRedirectUri(requestedRedirect, client.redirectUris)) {
            return this.consentErrorPage("invalid_redirect_uri")
        }

        const state = asString(query.state)
        const fail = (error: string, description: string) => this.redirectToClient(requestedRedirect, { error, error_description: description, state })

        if (query.response_type !== "code") {
            return fail("unsupported_response_type", "Only response_type=code is supported")
        }
        if (query.code_challenge_method !== "S256" || !isValidCodeChallenge(query.code_challenge)) {
            return fail("invalid_request", "PKCE is required: send a S256 code_challenge")
        }
        if (state && state.length > 2048) {
            return fail("invalid_request", "state is too long")
        }

        const resource = asString(query.resource)
        if (resource && !this.isOwnResource(resource)) {
            return fail("invalid_target", "This authorization server only issues tokens for its own MCP server")
        }

        const scopeParameter = asString(query.scope)
        const requestedScopes = scopeParameter ? MCP_SCOPES.filter(scope => scopeParameter.split(" ").includes(scope)) : [...MCP_SCOPES]
        if (requestedScopes.length === 0) {
            return fail("invalid_scope", `Supported scopes: ${MCP_SCOPES.join(" ")}`)
        }

        const handle = generateOpaqueToken()
        await OAuthAuthorizationRequest.create({
            handleHash: hashOpaqueToken(handle),
            clientId: client.clientId,
            redirectUri: requestedRedirect,
            redirectUriProvided: asString(query.redirect_uri) !== undefined,
            state,
            codeChallenge: query.code_challenge,
            scopes: requestedScopes,
            resource: this.config.resource,
            expiresAt: new Date(Date.now() + this.config.authorizationRequestTtlMs)
        })

        return `${this.config.frontendUrl}/oauth/consent?request=${encodeURIComponent(handle)}`
    }

    /**
     * The parked request, for the consent page, bound to the first console user who opens it.
     * Unknown, expired, and bound to somebody else all look the same: a 404.
     */
    async getRequestForConsent(handle: string, user: IUser): Promise<ConsentRequestDTO> {
        const request = await OAuthAuthorizationRequest.findOneAndUpdate(
            { handleHash: hashOpaqueToken(handle), expiresAt: { $gt: new Date() }, $or: [{ boundUserId: null }, { boundUserId: user._id }] },
            { boundUserId: user._id },
            { new: true }
        )
        const client = request ? await OAuthClient.findOne({ clientId: request.clientId }) : null
        if (!request || !client) {
            throw new EntityNotFoundError(handle, "Authorization request not found")
        }

        return {
            client: {
                name: client.clientName,
                registrationType: client.registrationType,
                redirectHost: describeRedirectHost(request.redirectUri),
                clientIdHost: client.registrationType === OAuthClientRegistrationType.CIMD ? (hostnameOf(client.clientId) ?? null) : null,
                warnings: consentWarnings(client, request.redirectUri, this.config.cimdAllowedHosts)
            },
            scopes: request.scopes,
            projects: await this.listConsentProjects(user),
            user: { email: user.email }
        }
    }

    /** Every project the user could bind the client to, with the role that will cap its scopes. */
    private async listConsentProjects(user: IUser): Promise<ConsentRequestDTO["projects"]> {
        const memberships = await UserProject.find({ userId: user._id, invitationToken: null }, { projectId: 1, role: 1 })
        const administered = await UserOrganization.find({ userId: user._id, role: { $in: ORGANIZATION_ADMIN_ROLES }, invitationToken: null }, { organizationId: 1 })
        const administeredIds = new Set(administered.map(membership => membership.organizationId.toString()))
        const roleByProject = new Map(memberships.map(membership => [membership.projectId.toString(), membership.role]))

        const projects = await Project.find({
            $or: [{ _id: { $in: memberships.map(membership => membership.projectId) } }, { organizationId: { $in: administered.map(membership => membership.organizationId) } }]
        }).sort({ name: 1 })
        const organizations = await Organization.find({ _id: { $in: [...new Set(projects.map(project => project.organizationId.toString()))].map(id => toObjectId(id)) } }, { name: 1 })
        const organizationNames = new Map(organizations.map(organization => [organization._id.toString(), organization.name]))

        return projects.map(project => ({
            id: project._id.toString(),
            name: project.name,
            organizationId: project.organizationId.toString(),
            organizationName: organizationNames.get(project.organizationId.toString()) ?? "",
            role: administeredIds.has(project.organizationId.toString()) ? RoleInProject.OWNER : (roleByProject.get(project._id.toString()) ?? RoleInProject.VIEWER)
        }))
    }

    /**
     * The user said yes: creates the grant and a single-use code, and answers with where to send
     * the browser. The grant shares every project picked on the page, each of which the user must
     * reach. The scopes are the ones chosen on the page, never more than the client asked for; write
     * is kept when at least one picked project lets the user write, and capped again per project
     * at every call (a VIEWER project stays read-only whatever the grant says).
     */
    async approve(handle: string, user: IUser, body: { projectIds?: unknown; scopes?: unknown }): Promise<{ redirectTo: string }> {
        const handleHash = hashOpaqueToken(handle)
        const request = await OAuthAuthorizationRequest.findOne({ handleHash, boundUserId: user._id, expiresAt: { $gt: new Date() } })
        if (!request) {
            throw new EntityNotFoundError(handle, "Authorization request not found")
        }

        const projectIds = Array.isArray(body?.projectIds) ? [...new Set(body.projectIds.filter((id): id is string => typeof id === "string" && id.length > 0))] : []
        // Every MCP call re-reads the role on each shared project, so the set has to stay small
        if (projectIds.length > MAX_GRANT_PROJECTS) {
            throw createBusinessException({ code: "MCP_TOO_MANY_PROJECTS", message: `Choose at most ${MAX_GRANT_PROJECTS} projects`, statusCode: 400 })
        }
        const roles: RoleInProject[] = []
        for (const projectId of projectIds) {
            const role = await resolveProjectRole(user._id, projectId)
            if (!role) {
                throw createBusinessException({ code: "MCP_PROJECT_NOT_ALLOWED", message: "One of the projects cannot be chosen for this client", statusCode: 403 })
            }
            roles.push(role)
        }
        if (projectIds.length === 0) {
            throw createBusinessException({ code: "MCP_PROJECT_REQUIRED", message: "Choose at least one project", statusCode: 400 })
        }

        const chosen = Array.isArray(body?.scopes) ? body.scopes.filter((scope): scope is string => typeof scope === "string") : []
        const requested = request.scopes.filter(scope => chosen.includes(scope))
        const scopes = roles.some(role => role !== RoleInProject.VIEWER) ? requested : capScopesToRole(requested, RoleInProject.VIEWER)
        if (scopes.length === 0) {
            throw createBusinessException({ code: "MCP_SCOPE_NOT_ALLOWED", message: "Choose at least one permission the client asked for and your role allows", statusCode: 400 })
        }

        // Deleted before anything is issued: of two concurrent approvals only one finds it
        const claimed = await OAuthAuthorizationRequest.findOneAndDelete({ _id: request._id })
        if (!claimed) {
            throw new EntityNotFoundError(handle, "Authorization request not found")
        }

        const grant = await createGrant({ userId: user._id, projectIds, clientId: request.clientId, scopes }, this.config)
        const code = generateOpaqueToken()
        const now = Date.now()
        await OAuthAuthorizationCode.create({
            codeHash: hashOpaqueToken(code),
            grantId: grant._id,
            clientId: request.clientId,
            redirectUri: request.redirectUri,
            redirectUriProvided: request.redirectUriProvided,
            codeChallenge: request.codeChallenge,
            resource: request.resource,
            scopes,
            expiresAt: new Date(now + this.config.authorizationCodeTtlMs),
            purgeAt: new Date(now + CODE_RETENTION_MS)
        })

        return { redirectTo: this.redirectToClient(request.redirectUri, { code, state: request.state }) }
    }

    async deny(handle: string, user: IUser): Promise<{ redirectTo: string }> {
        const request = await OAuthAuthorizationRequest.findOneAndDelete({ handleHash: hashOpaqueToken(handle), boundUserId: user._id, expiresAt: { $gt: new Date() } })
        if (!request) {
            throw new EntityNotFoundError(handle, "Authorization request not found")
        }
        return { redirectTo: this.redirectToClient(request.redirectUri, { error: "access_denied", error_description: "The user denied the request", state: request.state }) }
    }

    /** Required to match when it was sent at /authorize (or is sent now); absent on both sides is fine. */
    private redirectUriMatches(code: { redirectUri: string; redirectUriProvided?: boolean }, sent: unknown): boolean {
        if (code.redirectUriProvided === false && sent === undefined) {
            return true
        }
        return sent === code.redirectUri
    }

    private ensureResourceParameter(resource: unknown) {
        const value = asString(resource)
        if (value && !this.isOwnResource(value)) {
            throw new OAuthError("invalid_target", "Tokens are only issued for this server's MCP endpoint")
        }
    }

    private async issueTokens(grant: { grantId: string; userId: string; projectIds: string[]; clientId: string; scopes: string[] }, parentRefreshTokenId?: string): Promise<TokenResponse> {
        const access = await signMcpAccessToken(grant, this.config)
        const refreshToken = await issueRefreshToken(grant.grantId, grant.clientId, parentRefreshTokenId, this.config)
        return {
            access_token: access.token,
            token_type: "Bearer",
            expires_in: access.expiresIn,
            refresh_token: refreshToken,
            scope: grant.scopes.join(" ")
        }
    }

    /** grant_type=authorization_code: one exchange per code, PKCE and redirect URI checked. */
    async exchangeAuthorizationCode(params: Record<string, unknown>): Promise<TokenResponse> {
        const clientId = asString(params.client_id)
        const code = asString(params.code)
        if (!clientId || !code) {
            throw new OAuthError("invalid_request", "client_id and code are required")
        }

        const codeHash = hashOpaqueToken(code)
        const now = new Date()
        const consumed = await OAuthAuthorizationCode.findOneAndUpdate({ codeHash, consumedAt: null }, { consumedAt: now })
        if (!consumed) {
            // RFC 6749 §4.1.2: a code used twice has leaked, and what it produced must not survive
            const replayed = await OAuthAuthorizationCode.findOne({ codeHash })
            if (replayed?.consumedAt) {
                await revokeGrant(replayed.grantId.toString(), OAuthGrantRevocationReason.CODE_REUSE)
            }
            throw new OAuthError("invalid_grant", "The authorization code is invalid")
        }

        if (consumed.expiresAt <= now || consumed.clientId !== clientId || !this.redirectUriMatches(consumed, params.redirect_uri) || !verifyPkce(params.code_verifier, consumed.codeChallenge)) {
            throw new OAuthError("invalid_grant", "The authorization code is invalid, expired, or was issued to another client")
        }
        this.ensureResourceParameter(params.resource)

        const grant = await OAuthGrant.findById(consumed.grantId)
        const authenticated = grant ? await authenticateGrant({ grantId: grant._id.toString(), userId: grant.userId.toString(), clientId }) : undefined
        if (!grant || !authenticated) {
            throw new OAuthError("invalid_grant", "The authorization is no longer valid")
        }

        return this.issueTokens({
            grantId: grant._id.toString(),
            userId: grant.userId.toString(),
            projectIds: projectIdsOfGrant(grant),
            clientId,
            scopes: authenticated.scopes.filter(scope => consumed.scopes.includes(scope))
        })
    }

    /** grant_type=refresh_token: rotates the token, and a replayed one revokes the whole grant. */
    async refresh(params: Record<string, unknown>): Promise<TokenResponse> {
        const clientId = asString(params.client_id)
        const refreshToken = asString(params.refresh_token)
        if (!clientId || !refreshToken) {
            throw new OAuthError("invalid_request", "client_id and refresh_token are required")
        }
        this.ensureResourceParameter(params.resource)

        const consumption = await consumeRefreshToken(refreshToken, clientId)
        if (consumption.status === "reused") {
            await revokeGrant(consumption.grantId, OAuthGrantRevocationReason.REFRESH_TOKEN_REUSE)
        }
        if (consumption.status !== "consumed") {
            throw new OAuthError("invalid_grant", "The refresh token is invalid")
        }

        const grant = await OAuthGrant.findById(toObjectId(consumption.grantId))
        const authenticated = grant ? await authenticateGrant({ grantId: grant._id.toString(), userId: grant.userId.toString(), clientId }) : undefined
        if (!grant || !authenticated) {
            throw new OAuthError("invalid_grant", "The authorization is no longer valid")
        }

        let scopes = authenticated.scopes
        const scopeParameter = asString(params.scope)
        if (scopeParameter) {
            const requested = scopeParameter.split(" ").filter(Boolean)
            if (requested.some(scope => !scopes.includes(scope))) {
                throw new OAuthError("invalid_scope", "A refresh can only narrow the granted scopes")
            }
            scopes = requested
        }

        return this.issueTokens({ grantId: grant._id.toString(), userId: grant.userId.toString(), projectIds: projectIdsOfGrant(grant), clientId, scopes }, consumption.tokenId)
    }

    /**
     * RFC 7009 revocation. Either token revokes the grant it belongs to, which is what a client
     * means when it signs out. The answer is the same whether or not the token was known, so the
     * endpoint cannot be used to test tokens.
     */
    async revoke(params: Record<string, unknown>): Promise<void> {
        const token = asString(params.token)
        if (!token) {
            throw new OAuthError("invalid_request", "token is required")
        }

        const refreshToken = await OAuthRefreshToken.findOne({ tokenHash: hashOpaqueToken(token) })
        if (refreshToken) {
            await revokeGrant(refreshToken.grantId.toString(), OAuthGrantRevocationReason.CLIENT)
            return
        }

        try {
            const claims = await verifyMcpAccessToken(token, this.config)
            await revokeGrant(claims.grantId, OAuthGrantRevocationReason.CLIENT)
        } catch {
            // Unknown or invalid: nothing to revoke, and nothing to say about it
        }
    }
}

export default OAuthAuthorizationService
