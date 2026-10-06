import type { AuthInfo } from "@modelcontextprotocol/server"
import { Types } from "mongoose"
import { ApiKeyRole } from "../models/ApiKeyModel"
import User, { IUser } from "../models/UserModel"
import { resolveApiKey } from "../plugins/autorization"
import { authenticateGrant } from "../service/OAuthGrantService"
import { verifyMcpAccessToken } from "../service/OAuthTokenService"
import { CachedApiKeyCredential, cacheApiKeyCredential, getCachedApiKeyCredential, hashApiKey } from "../utils/apiKeyCredentialCache"
import { getOAuthConfig, MCP_SCOPE_READ, MCP_SCOPE_WRITE, OAuthConfig } from "../utils/oauthConfig"
import { McpToolContext } from "./toolDefinition"

/** Where the tool context travels inside the SDK's pass-through `authInfo.extra`. */
export const MCP_CONTEXT_KEY = "mfeOrchestratorContext"

export type McpAuthenticationResult = { authInfo: AuthInfo; context: McpToolContext } | { error: "missing_token" | "invalid_token" }

const readBearer = (authorization: string | undefined): string | undefined => {
    const match = /^Bearer\s+(\S+)\s*$/i.exec(authorization ?? "")
    return match?.[1]
}

/** A JWT is three base64url segments; a project API key (a UUID) never contains a dot. */
const looksLikeJwt = (value: string) => /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(value)

export interface McpRequestHeaders {
    authorization?: string
    "api-key"?: string | string[]
}

/**
 * Authenticates one MCP request, with an OAuth access token or, as a fallback for clients that
 * cannot do OAuth, a project API key.
 *
 * A bearer value shaped like a JWT only ever takes the token path: a forged or expired token is a
 * 401, never a second try as an API key. Anything else in the bearer, or the `api-key` header, is
 * tried as an API key. No credential at all keeps the plain challenge, so OAuth discovery starts.
 */
export const authenticateMcpRequest = async (headers: McpRequestHeaders, config: OAuthConfig = getOAuthConfig()): Promise<McpAuthenticationResult> => {
    const bearer = readBearer(headers.authorization)
    const headerKey = typeof headers["api-key"] === "string" && headers["api-key"].length > 0 ? headers["api-key"] : undefined
    if (bearer && looksLikeJwt(bearer)) {
        return authenticateAccessToken(bearer, config)
    }
    const apiKey = bearer ?? headerKey
    if (!apiKey) {
        return { error: headers.authorization ? "invalid_token" : "missing_token" }
    }
    return config.apiKeyEnabled ? authenticateApiKey(apiKey, config) : { error: "invalid_token" }
}

/**
 * The token proves who and which grant; the grant is then reloaded, so a revocation, an expired
 * grant or a lost membership cut the client off on its very next call. The scopes in force are
 * those of the token capped by today's role: a member demoted to VIEWER keeps a token that says
 * `mfe:write`, and still only gets read tools.
 */
const authenticateAccessToken = async (token: string, config: OAuthConfig): Promise<McpAuthenticationResult> => {
    let claims: Awaited<ReturnType<typeof verifyMcpAccessToken>>
    try {
        claims = await verifyMcpAccessToken(token, config)
    } catch {
        return { error: "invalid_token" }
    }

    const authenticated = await authenticateGrant(claims)
    const user = authenticated ? await User.findById(claims.userId) : null
    if (!authenticated || !user || user.activateEmailToken) {
        return { error: "invalid_token" }
    }

    const scopes = claims.scopes.filter(scope => authenticated.scopes.includes(scope))
    const context: McpToolContext = {
        principal: { ...user.toObject(), restrictedToProjectId: claims.projectId },
        projectId: claims.projectId,
        scopes,
        credential: { kind: "oauth", grantId: claims.grantId, clientId: claims.clientId }
    }

    return {
        context,
        authInfo: {
            token,
            clientId: claims.clientId,
            scopes,
            expiresAt: claims.expiresAt,
            resource: new URL(config.resource),
            resourceMetadataUrl: config.protectedResourceMetadataUrl,
            extra: { [MCP_CONTEXT_KEY]: context }
        }
    }
}

/** What a project API key may do: a VIEWER key reads, a MANAGER key does everything the tools offer. */
export const scopesForApiKeyRole = (role: string): string[] => (role === ApiKeyRole.VIEWER ? [MCP_SCOPE_READ] : [MCP_SCOPE_READ, MCP_SCOPE_WRITE])

/**
 * A project API key, refused exactly as the API key routes refuse it (revoked, expired, unknown),
 * through the same lookup. A recent positive answer comes from the cache instead of another round
 * of bcrypt comparisons over every live key.
 */
const authenticateApiKey = async (apiKey: string, config: OAuthConfig): Promise<McpAuthenticationResult> => {
    const hash = hashApiKey(apiKey)
    let credential: CachedApiKeyCredential | undefined = await getCachedApiKeyCredential(hash)
    if (!credential) {
        try {
            const resolved = await resolveApiKey(apiKey)
            credential = { apiKeyId: resolved._id.toString(), projectId: resolved.projectId.toString(), role: resolved.role, expiresAt: resolved.expiresAt.getTime() }
        } catch {
            return { error: "invalid_token" }
        }
        await cacheApiKeyCredential(hash, credential)
    }

    const scopes = scopesForApiKeyRole(credential.role)
    // No user stands behind a key: a synthetic principal confined to the key's project
    const principal = {
        _id: new Types.ObjectId(credential.apiKeyId),
        email: `api-key:${credential.apiKeyId}`,
        apiKeyId: credential.apiKeyId,
        restrictedToProjectId: credential.projectId
    } as unknown as IUser & { apiKeyId: string; restrictedToProjectId: string }
    const context: McpToolContext = {
        principal,
        projectId: credential.projectId,
        scopes,
        credential: { kind: "api_key", apiKeyId: credential.apiKeyId }
    }

    return {
        context,
        authInfo: {
            // The key itself stays out of what the SDK hands around
            token: `api-key:${credential.apiKeyId}`,
            clientId: `api-key:${credential.apiKeyId}`,
            scopes,
            expiresAt: Math.floor(credential.expiresAt / 1000),
            resource: new URL(config.resource),
            resourceMetadataUrl: config.protectedResourceMetadataUrl,
            extra: { [MCP_CONTEXT_KEY]: context }
        }
    }
}

/**
 * RFC 6750 / RFC 9728 challenge: tells the client where to discover the authorization server,
 * and with `error="invalid_token"` that the token it sent is not worth retrying.
 */
export const buildWwwAuthenticate = (config: OAuthConfig, error?: "invalid_token"): string => {
    const parts = [
        ...(error ? [`error="${error}"`, `error_description="The access token is invalid, expired or revoked"`] : []),
        `resource_metadata="${config.protectedResourceMetadataUrl}"`,
        `scope="mfe:read mfe:write"`
    ]
    return `Bearer ${parts.join(", ")}`
}
