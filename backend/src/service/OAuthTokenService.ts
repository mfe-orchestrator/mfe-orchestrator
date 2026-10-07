import { hkdfSync, randomUUID } from "node:crypto"
import { jwtVerify, SignJWT } from "jose"
import OAuthError from "../errors/OAuthError"
import OAuthRefreshToken from "../models/OAuthRefreshTokenModel"
import { getSecret } from "../models/UserModel"
import { toObjectId } from "../utils/mongooseUtils"
import { getOAuthConfig, OAuthConfig } from "../utils/oauthConfig"
import { generateOpaqueToken, hashOpaqueToken } from "../utils/pkce"

/** JWT type of the MCP access tokens (RFC 9068). A console token never carries it. */
export const MCP_ACCESS_TOKEN_TYPE = "at+jwt"

export interface McpAccessTokenClaims {
    userId: string
    clientId: string
    grantId: string
    /** The projects the grant shares (claim `project_ids`) */
    projectIds: string[]
    scopes: string[]
    /** Seconds since epoch, as in `exp` */
    expiresAt: number
}

/**
 * The key MCP access tokens are signed with, derived from JWT_SECRET but never equal to it.
 *
 * A separate key is what keeps the two token families apart even if a check is ever missed: a
 * console token does not verify as a MCP token and a MCP token does not verify as a console token,
 * because neither was signed with the other's key.
 */
export const getMcpAccessTokenKey = (): Uint8Array => new Uint8Array(hkdfSync("sha256", getSecret(), "mfe-orchestrator", "mcp-access-token-v1", 32))

export const signMcpAccessToken = async (claims: Omit<McpAccessTokenClaims, "expiresAt">, config: OAuthConfig = getOAuthConfig()): Promise<{ token: string; expiresIn: number }> => {
    const expiresIn = Math.floor(config.accessTokenTtlMs / 1000)
    const token = await new SignJWT({
        client_id: claims.clientId,
        grant_id: claims.grantId,
        project_ids: claims.projectIds,
        scope: claims.scopes.join(" ")
    })
        .setProtectedHeader({ alg: "HS256", typ: MCP_ACCESS_TOKEN_TYPE })
        .setIssuer(config.issuer)
        .setAudience(config.resource)
        .setSubject(claims.userId)
        .setJti(randomUUID())
        .setIssuedAt()
        .setExpirationTime(`${expiresIn}s`)
        .sign(getMcpAccessTokenKey())
    return { token, expiresIn }
}

/**
 * Verifies a MCP access token: signature, issuer, audience (RFC 8707: a token minted for another
 * resource is not accepted here), type and expiry. Says nothing about the grant behind it, which
 * the caller reloads on every request.
 */
export const verifyMcpAccessToken = async (token: string, config: OAuthConfig = getOAuthConfig()): Promise<McpAccessTokenClaims> => {
    try {
        const { payload } = await jwtVerify(token, getMcpAccessTokenKey(), {
            issuer: config.issuer,
            audience: config.resource,
            typ: MCP_ACCESS_TOKEN_TYPE,
            algorithms: ["HS256"]
        })
        // `project_id` is what tokens said before a grant could share several projects: such a token
        // lives at most 15 minutes, read it as a one-element list until it expires
        const projectIds = Array.isArray(payload.project_ids) ? payload.project_ids : typeof payload.project_id === "string" ? [payload.project_id] : undefined
        if (
            !payload.sub ||
            typeof payload.grant_id !== "string" ||
            !projectIds ||
            projectIds.length === 0 ||
            projectIds.some(projectId => typeof projectId !== "string") ||
            typeof payload.client_id !== "string" ||
            !payload.exp
        ) {
            throw new Error("Missing claims")
        }
        return {
            userId: payload.sub,
            clientId: payload.client_id,
            grantId: payload.grant_id,
            projectIds: projectIds as string[],
            scopes: typeof payload.scope === "string" ? payload.scope.split(" ").filter(Boolean) : [],
            expiresAt: payload.exp
        }
    } catch {
        throw new OAuthError("invalid_token", "The access token is invalid or expired", 401)
    }
}

/** Issues the next refresh token of a grant's chain. The token itself is returned once and only hashed at rest. */
export const issueRefreshToken = async (grantId: string, clientId: string, parentId?: string, config: OAuthConfig = getOAuthConfig()): Promise<string> => {
    const token = generateOpaqueToken()
    await OAuthRefreshToken.create({
        tokenHash: hashOpaqueToken(token),
        grantId: toObjectId(grantId),
        clientId,
        parentId: parentId ? toObjectId(parentId) : undefined,
        expiresAt: new Date(Date.now() + config.refreshTokenIdleTtlMs)
    })
    return token
}

export type RefreshTokenConsumption = { status: "consumed"; grantId: string; tokenId: string } | { status: "reused"; grantId: string } | { status: "invalid" }

/**
 * Marks a refresh token used, atomically: of two concurrent refreshes with the same token exactly
 * one gets `consumed`, the other gets `reused` and the caller revokes the grant.
 */
export const consumeRefreshToken = async (token: string, clientId: string): Promise<RefreshTokenConsumption> => {
    const tokenHash = hashOpaqueToken(token)
    const now = new Date()
    const consumed = await OAuthRefreshToken.findOneAndUpdate({ tokenHash, clientId, usedAt: null, expiresAt: { $gt: now } }, { usedAt: now }, { new: true })
    if (consumed) {
        return { status: "consumed", grantId: consumed.grantId.toString(), tokenId: consumed._id.toString() }
    }

    const existing = await OAuthRefreshToken.findOne({ tokenHash })
    if (existing?.usedAt && existing.clientId === clientId) {
        return { status: "reused", grantId: existing.grantId.toString() }
    }
    return { status: "invalid" }
}

/** Drops every refresh token of a grant: once it is revoked, none of them may come back to life. */
export const deleteRefreshTokensOfGrant = async (grantId: string): Promise<void> => {
    await OAuthRefreshToken.deleteMany({ grantId: toObjectId(grantId) })
}
