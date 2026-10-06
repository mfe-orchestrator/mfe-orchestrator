/** The only two scopes this installation hands out. Deploy and rollback live inside `mfe:write`. */
export const MCP_SCOPE_READ = "mfe:read"
export const MCP_SCOPE_WRITE = "mfe:write"
export const MCP_SCOPES = [MCP_SCOPE_READ, MCP_SCOPE_WRITE] as const
export type McpScope = (typeof MCP_SCOPES)[number]

const SECOND = 1000
const MINUTE = 60 * SECOND
const DAY = 24 * 60 * MINUTE

export interface OAuthConfig {
    enabled: boolean
    /** The `iss` of every token and the base of every OAuth endpoint, e.g. https://host/api */
    issuer: string
    /** The RFC 8707 resource the access tokens are minted for, e.g. https://host/api/mcp */
    resource: string
    /** RFC 9728: the metadata URL is the resource path inserted after /.well-known/oauth-protected-resource */
    protectedResourceMetadataUrl: string
    frontendUrl: string
    dcrEnabled: boolean
    /** Fallback for clients that cannot do OAuth: a project API key on /mcp. */
    apiKeyEnabled: boolean
    /** MCP requests per minute per grant or API key, on top of the per-IP limit. */
    mcpRateLimitMax: number
    cimdEnabled: boolean
    /** Empty means every host may publish a client metadata document. */
    cimdAllowedHosts: string[]
    accessTokenTtlMs: number
    refreshTokenIdleTtlMs: number
    grantMaxTtlMs: number
    authorizationCodeTtlMs: number
    authorizationRequestTtlMs: number
}

/**
 * Environment switches arrive as strings when read straight from `process.env`: only an explicit
 * "true" (or "1") turns one on, so a typo leaves a feature off rather than on.
 */
export const parseBooleanFlag = (value: string | boolean | undefined, fallback: boolean): boolean => {
    if (value === undefined || value === "") return fallback
    if (typeof value === "boolean") return value
    return ["true", "1", "yes", "on"].includes(value.trim().toLowerCase())
}

const withoutTrailingSlash = (url: string) => url.replace(/\/+$/, "")

/**
 * Where a token for this resource is described.
 *
 * RFC 9728 inserts the well-known segment between the origin and the resource path, it does not
 * append it: https://host/api/mcp is described at https://host/.well-known/oauth-protected-resource/api/mcp.
 */
export const protectedResourceMetadataUrlFor = (resource: string): string => {
    let url: URL
    try {
        url = new URL(resource)
    } catch {
        // No usable public URL configured: only possible with MCP off, which the boot check enforces
        return ""
    }
    const path = url.pathname === "/" ? "" : withoutTrailingSlash(url.pathname)
    return `${url.origin}/.well-known/oauth-protected-resource${path}`
}

/**
 * The MCP authorization server and resource configuration, read from the environment.
 *
 * Read from `process.env` rather than `fastify.config` because the token service and the MCP
 * tools need it outside a request, exactly like `getBackendUrl`, whose fallback it repeats.
 */
export const getOAuthConfig = (env: NodeJS.ProcessEnv = process.env): OAuthConfig => {
    // Same fallback as getBackendUrl, spelled out against `env` so the configuration can be tested
    const issuer = withoutTrailingSlash(env.OAUTH_ISSUER_URL || env.BACKEND_URL || `${withoutTrailingSlash(env.FRONTEND_URL || "")}/api`)
    const resource = withoutTrailingSlash(env.MCP_RESOURCE_URL || `${issuer}/mcp`)

    return {
        enabled: parseBooleanFlag(env.MCP_ENABLED, false),
        issuer,
        resource,
        protectedResourceMetadataUrl: protectedResourceMetadataUrlFor(resource),
        frontendUrl: withoutTrailingSlash(env.FRONTEND_URL || ""),
        dcrEnabled: parseBooleanFlag(env.MCP_DCR_ENABLED, true),
        apiKeyEnabled: parseBooleanFlag(env.MCP_API_KEY_ENABLED, true),
        mcpRateLimitMax: Number(env.MCP_RATE_LIMIT_MAX) > 0 ? Number(env.MCP_RATE_LIMIT_MAX) : 120,
        cimdEnabled: parseBooleanFlag(env.MCP_CIMD_ENABLED, true),
        cimdAllowedHosts: (env.CIMD_ALLOWED_HOSTS || "")
            .split(",")
            .map(host => host.trim().toLowerCase())
            .filter(Boolean),
        accessTokenTtlMs: 15 * MINUTE,
        refreshTokenIdleTtlMs: 30 * DAY,
        grantMaxTtlMs: 90 * DAY,
        authorizationCodeTtlMs: 60 * SECOND,
        authorizationRequestTtlMs: 10 * MINUTE
    }
}

/** Values copied from examples: as good as public, so as good as no secret at all. */
const PLACEHOLDER_SECRETS = ["change-me", "changeme", "your-secret-key", "secret"]
/** HS256 keys shorter than the hash output weaken it (RFC 7518 §3.2). */
const MIN_JWT_SECRET_BYTES = 32

/**
 * Whether the boot may proceed with this environment.
 *
 * The console has always fallen back to a hard-coded JWT secret when none is set. With MCP on,
 * that fallback would also be the root of every MCP access token, which outlive a console session
 * and are handed to third-party clients: the boot refuses instead of starting with a public key.
 */
export const assertMcpConfigurationIsUsable = (env: NodeJS.ProcessEnv = process.env): void => {
    if (!parseBooleanFlag(env.MCP_ENABLED, false)) return
    if (!env.JWT_SECRET) {
        throw new Error("MCP_ENABLED is set but JWT_SECRET is not: the MCP access tokens would be signed with the public fallback secret. Set JWT_SECRET.")
    }
    if (PLACEHOLDER_SECRETS.includes(env.JWT_SECRET.trim().toLowerCase()) || Buffer.byteLength(env.JWT_SECRET) < MIN_JWT_SECRET_BYTES) {
        throw new Error(`MCP_ENABLED is set but JWT_SECRET is a placeholder or shorter than ${MIN_JWT_SECRET_BYTES} bytes. Generate one with: openssl rand -hex 32`)
    }
    if (!env.FRONTEND_URL) {
        throw new Error("MCP_ENABLED is set but FRONTEND_URL is not: the consent page could not be reached.")
    }
}

/**
 * Fastify's `trustProxy` from TRUST_PROXY.
 *
 * "true" trusts every hop, a number trusts that many hops, anything else is a comma separated list
 * of addresses or CIDRs. Unset keeps the previous behaviour (no proxy trusted), under which every
 * request behind nginx shares one IP and one rate limit bucket.
 */
export const parseTrustProxy = (value: string | undefined): boolean | number | string[] => {
    if (!value) return false
    const trimmed = value.trim()
    if (trimmed.toLowerCase() === "true") return true
    if (trimmed.toLowerCase() === "false") return false
    if (/^\d+$/.test(trimmed)) return Number(trimmed)
    return trimmed
        .split(",")
        .map(entry => entry.trim())
        .filter(Boolean)
}

/**
 * A request URL fit for the logs. The consent handle in /oauth/requests/<handle> is what binds an
 * authorization request to whoever opens it first: whoever reads the logs must not be that person.
 */
export const redactOAuthUrl = (url: string): string => url.replace(/(\/oauth\/requests\/)[^/?#]+/, "$1[redacted]")
