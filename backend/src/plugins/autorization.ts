import { createHash } from "node:crypto"
import axios from "axios"
import { FastifyInstance, FastifyRequest } from "fastify"
import fastifyPlugin from "fastify-plugin"
import { createRemoteJWKSet, JWTVerifyGetKey, jwtVerify } from "jose"
import jwt, { JwtPayload } from "jsonwebtoken"
import AuthenticationError from "../errors/AuthenticationError"
import ApiKey, { ApiKeyStatus, IApiKeyDocument } from "../models/ApiKeyModel"
import UserModel, { getSecret, ISSUER } from "../models/UserModel"
import UserService, { FEDERATED_LOGIN_WINDOW_MS, recordLogin } from "../service/UserService"
import AuthenticationMethod from "../types/AuthenticationMethod"
import { redisClient } from "./redis"

interface AuthUserDTO {
    name?: string
    surname?: string
    email: string
    id?: string
}

const TOKEN_EXPIRATION = 60 * 60
// export const userHasGrants = (requiredGrants?: string[], userGrants?: string[]) => {
//   if (!requiredGrants) return true;
//   if (!userGrants) return false;
//   return requiredGrants.some(grant => userGrants.includes(grant));
// };

// const getUserFromAuth0 = async (fastify: FastifyInstance, userId: string, token: string): Promise<Auth0UserDTO> => {
//   //Looking into cache
//   let userFromCache = null
//   if(fastify.redis !== undefined){
//     userFromCache = await fastify.redis.get(userId);
//   }
//   if (userFromCache) return JSON.parse(userFromCache);
//   // user is not in cache, looking into auth0
//   const response = await axios.get(`https://${fastify.config.AUTH0_DOMAIN}/userinfo`, {
//     headers: {
//       Authorization: `Bearer ${token}`,
//     },
//   });

//   try {
//     if (fastify.redis !== undefined) {
//       // Setting user in cache
//       await fastify.redis.set(userId, JSON.stringify(response.data));
//     }else{
//       fastify.log.error("Redis not defined, unable to set user in cache")
//     }
//   } catch (e) {
//     fastify.log.error(e);
//   }
//   return response.data;
// };

/**
 * Rejects a Google token minted for another application.
 *
 * tokeninfo answers for any valid Google access token, whoever it was issued to: without this
 * check a token obtained by an unrelated app that the user once signed in to would open the
 * console, and the MCP consent page trusts the console login.
 */
export const ensureGoogleAudience = (fastify: FastifyInstance, tokenInfo: Record<string, unknown>): void => {
    const expected = fastify.config.GOOGLE_CLIENT_ID
    const audience = tokenInfo.audience ?? tokenInfo.aud ?? tokenInfo.issued_to
    if (!expected || audience !== expected) {
        throw new AuthenticationError("Google token was not issued to this application")
    }
}

const getDataFromGoogle = async (fastify: FastifyInstance, authToken: string): Promise<AuthUserDTO> => {
    if (redisClient) {
        const userFromCache = await redisClient.get(authToken)
        if (userFromCache) {
            const cached = JSON.parse(userFromCache)
            ensureGoogleAudience(fastify, cached)
            return cached
        }
    }

    const response = await axios.get(`https://www.googleapis.com/oauth2/v1/tokeninfo`, {
        headers: {
            Authorization: `Bearer ${authToken}`
        }
    })
    // Checked before caching, so a foreign token never lands in the cache either
    ensureGoogleAudience(fastify, response.data)
    if (redisClient) {
        await redisClient.set(authToken, JSON.stringify(response.data), {
            EX: TOKEN_EXPIRATION
        })
    }
    return response.data
}

/**
 * An Auth0 access token, verified against the tenant's published keys before anything else.
 *
 * The token used to be only decoded, and the cached profile was looked up by its `sub` before
 * any check: an unsigned token naming someone else's `sub` logged in as them while their profile
 * sat in the cache. The audience is the API audience the console requests its tokens for
 * (AUTH0_AUDIENCE): without it Auth0 hands out opaque tokens, which cannot be verified here.
 * The cache is keyed by a hash of the verified token itself, never by a claim inside it.
 */
const getDataFromAuth0 = async (fastify: FastifyInstance, authToken: string): Promise<AuthUserDTO> => {
    const domain = fastify.config.AUTH0_DOMAIN
    const audience = fastify.config.AUTH0_AUDIENCE
    if (!domain || !audience) {
        throw new AuthenticationError("Auth0 login is not fully configured: AUTH0_DOMAIN and AUTH0_AUDIENCE are required")
    }

    let expiresAt: number | undefined
    try {
        const verified = await jwtVerify(authToken, getRemoteKeySet(`https://${domain}/.well-known/jwks.json`), {
            issuer: `https://${domain}/`,
            audience,
            algorithms: ["RS256"]
        })
        expiresAt = verified.payload.exp
    } catch {
        throw new AuthenticationError("Invalid Auth0 token")
    }

    const cacheKey = `auth0:${createHash("sha256").update(authToken).digest("hex")}`
    if (redisClient) {
        const userFromCache = await redisClient.get(cacheKey)
        if (userFromCache) {
            return JSON.parse(userFromCache)
        }
    }

    const response = await axios.get(`https://${domain}/userinfo`, {
        headers: {
            Authorization: `Bearer ${authToken}`
        }
    })

    const realResponse = {
        ...response.data,
        name: response.data.family_name,
        surname: response.data.given_name
    }

    if (redisClient) {
        // Never outlives the token it was looked up with
        const secondsLeft = expiresAt ? expiresAt - Math.floor(Date.now() / 1000) : TOKEN_EXPIRATION
        await redisClient.set(cacheKey, JSON.stringify(realResponse), {
            EX: Math.max(1, Math.min(TOKEN_EXPIRATION, secondsLeft))
        })
    }
    return realResponse
}

/**
 * A console session token, and only that.
 *
 * MCP access tokens are JWTs too, signed with a key derived from the same secret: one that reached
 * this function must not open a console session. They are typed `at+jwt` and carry an audience,
 * a console token has neither, so either mark is enough to refuse it.
 */
const getDataFromLocal = async (fastify: FastifyInstance, authToken: string): Promise<AuthUserDTO> => {
    const decodedToken = jwt.verify(authToken, getSecret(), { complete: true })
    if (!decodedToken) {
        throw new AuthenticationError("Invalid token")
    }
    const payload = decodedToken.payload as JwtPayload
    if (decodedToken.header.typ?.toLowerCase() === "at+jwt" || payload.aud !== undefined) {
        throw new AuthenticationError("Access tokens for the MCP server cannot open a console session")
    }
    return { email: payload.email, id: payload.id }
}

/**
 * Signing keys of the identity providers (Entra ID tenants, Auth0), one remote set per URL.
 *
 * jose caches the key set and refetches it on an unknown `kid`, so keeping one instance per URL
 * is what makes verification free after the first request.
 */
const remoteKeySets = new Map<string, JWTVerifyGetKey>()

const getRemoteKeySet = (url: string): JWTVerifyGetKey => {
    let keySet = remoteKeySets.get(url)
    if (!keySet) {
        keySet = createRemoteJWKSet(new URL(url))
        remoteKeySets.set(url, keySet)
    }
    return keySet
}

/**
 * An Entra ID token, verified against the tenant's published keys.
 *
 * The token used to be only decoded, so anyone could forge one for the configured issuer and log in
 * as any user. The console sends the ID token, whose audience is the SPA client id; the API audience
 * is accepted too for installations that send an access token instead.
 */
const getDataFromMsal = async (fastify: FastifyInstance, authToken: string, issuer: string): Promise<AuthUserDTO> => {
    const tenantId = fastify.config.AZURE_ENTRAID_TENANT_ID
    const audiences = [fastify.config.AZURE_ENTRAID_CLIENT_ID, fastify.config.AZURE_ENTRAID_API_AUDIENCE].filter(Boolean)
    if (audiences.length === 0) {
        throw new AuthenticationError("Entra ID login is not fully configured: AZURE_ENTRAID_CLIENT_ID is missing")
    }

    let payload: JwtPayload
    try {
        const verified = await jwtVerify(authToken, getRemoteKeySet(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`), { issuer, audience: audiences })
        payload = verified.payload as JwtPayload
    } catch {
        throw new AuthenticationError("Invalid Entra ID token")
    }

    return {
        email: payload.email || payload.preferred_username,
        name: payload.name
    }
}

/**
 * The Entra ID issuer this installation accepts, or undefined when no tenant is
 * configured.
 *
 * Interpolating an unset tenant would produce an issuer with an empty tenant
 * segment, a string a crafted token can state as its own `iss` — so an
 * installation that never enabled Entra login would start accepting tokens for
 * that issuer.
 */
const getEntraIdIssuer = (fastify: FastifyInstance): string | undefined => {
    const tenantId = fastify.config.AZURE_ENTRAID_TENANT_ID
    return tenantId ? `https://login.microsoftonline.com/${tenantId}/v2.0` : undefined
}

/**
 * Who the caller is, and whether an external identity provider vouched for them.
 *
 * `isFederated` is decided here, by the strategy that actually resolved the token,
 * and never by the `issuer` request header: the header is picked by the client, so
 * letting it decide would let a caller present a token issued by this platform and
 * still be treated as federated — which is what turns "user unknown" into "provision
 * a new user" further down.
 */
export interface ResolvedAuthentication {
    user: AuthUserDTO
    isFederated: boolean
}

export const resolveAuthentication = async (fastify: FastifyInstance, authToken: string, issuer: string): Promise<ResolvedAuthentication | undefined> => {
    switch (issuer) {
        case "google":
            return { user: await getDataFromGoogle(fastify, authToken), isFederated: true }
        case "auth0":
            return { user: await getDataFromAuth0(fastify, authToken), isFederated: true }
        default: {
            const decodedToken = jwt.decode(authToken, {
                json: true,
                complete: true
            })
            if (!decodedToken) {
                throw new AuthenticationError("Invalid token")
            }
            const payload = decodedToken.payload as JwtPayload
            if (!payload.exp || payload.exp < Date.now() / 1000) {
                throw new AuthenticationError("Token expired")
            }
            if (payload.iss == ISSUER) {
                // Local access whatever the header claimed: getDataFromLocal verifies the
                // signature against this platform's own secret, which is the proof.
                return { user: await getDataFromLocal(fastify, authToken), isFederated: false }
            }
            const entraIdIssuer = getEntraIdIssuer(fastify)
            if (entraIdIssuer && payload.iss === entraIdIssuer) {
                return { user: await getDataFromMsal(fastify, authToken, entraIdIssuer), isFederated: true }
            }
        }
    }
}

/**
 * When the identity provider authenticated the user, taken from the token.
 *
 * `auth_time` is the interactive sign-in and does not move when the token is
 * refreshed silently, so it is preferred over `iat`. Returns undefined for a token
 * that is not a JWT (a Google access token is opaque) or that states neither
 * claim: there the caller has to date the access by arrival time instead.
 */
export const getFederatedAuthenticationMoment = (authToken: string): Date | undefined => {
    let payload: JwtPayload | null = null
    try {
        payload = jwt.decode(authToken, { json: true })
    } catch {
        return undefined
    }

    const seconds = typeof payload?.auth_time === "number" ? payload.auth_time : payload?.iat
    return typeof seconds === "number" ? new Date(seconds * 1000) : undefined
}

/**
 * The key is stored hashed, so it cannot be looked up: every candidate has to be
 * compared with bcrypt until one matches.
 */
const findMatching = async (candidates: IApiKeyDocument[], apiKey: string): Promise<IApiKeyDocument | undefined> => {
    for (const candidate of candidates) {
        if (await candidate.compareApiKey(apiKey)) {
            return candidate
        }
    }
    return undefined
}

/**
 * Resolves an API key to the key it is, rejecting a key that is revoked or past its expiry.
 *
 * Both conditions are part of the query rather than checked afterwards: the loop below
 * runs one bcrypt comparison per candidate, so narrowing the set is what keeps the cost
 * down as an installation accumulates keys.
 *
 * A key that fails only because it is revoked or expired is looked up a second time, and
 * only to name the reason: "not found" sends whoever configured the pipeline looking for a
 * key that is sitting right there. The caller already holds the key, so saying why it was
 * refused tells them nothing they did not have.
 *
 * Shared by the API key routes and the MCP endpoint, so both refuse exactly the same keys.
 */
export const resolveApiKey = async (apiKey: unknown): Promise<IApiKeyDocument> => {
    if (!apiKey || typeof apiKey !== "string") {
        throw new AuthenticationError("API key not found")
    }

    const usable = await ApiKey.find({ status: ApiKeyStatus.ACTIVE, expiresAt: { $gt: new Date() } })
    const apiKeyFromDb = await findMatching(usable, apiKey)

    if (apiKeyFromDb) {
        return apiKeyFromDb
    }

    const refused = await findMatching(await ApiKey.find({ $or: [{ status: { $ne: ApiKeyStatus.ACTIVE } }, { expiresAt: { $lte: new Date() } }] }), apiKey)

    if (!refused) {
        throw new AuthenticationError("API key not found")
    }

    throw new AuthenticationError(refused.status !== ApiKeyStatus.ACTIVE ? "API key revoked" : `API key expired on ${refused.expiresAt.toISOString()}`)
}

/** The project of the API key the request carries, in the `api-key` header or the `apiKey` query parameter. */
export const checkApiKey = async (request: FastifyRequest): Promise<string> => {
    const apiKey = request.headers["api-key"] || (request.query as Record<string, unknown>)["apiKey"]
    return (await resolveApiKey(apiKey)).projectId.toString()
}

export default fastifyPlugin(
    async (fastify: FastifyInstance) => {
        fastify.addHook("preHandler", async (request, response) => {
            fastify.log.debug("Pre handler login START")
            const authMethod = request.routeOptions.config.authMethod || AuthenticationMethod.JWT
            if (authMethod === AuthenticationMethod.PUBLIC || request.routeOptions.url?.startsWith("/api-docs")) {
                fastify.log.debug("Authorization is public")
                return
            }

            if (authMethod === AuthenticationMethod.API_KEY) {
                fastify.log.debug("Authorization is API Key")
                const projectId = await checkApiKey(request)
                request.headers["project-id"] = projectId
                return
            }

            fastify.log.debug("Authorization is JWT")
            // Never logged: a bearer token in the logs is a session handed to whoever reads them
            const authToken = request?.headers?.["authorization"]?.replace("Bearer ", "")
            if (!authToken) {
                throw new AuthenticationError("Missing or invalid Authorization header")
            }
            // The header only selects which strategy reads the token; whether the access
            // counts as federated is what that strategy concluded, not what was asked for.
            const issuer = (request.headers["issuer"] as string) || ISSUER
            const authentication = await resolveAuthentication(fastify, authToken, issuer)
            if (!authentication) {
                throw new AuthenticationError("User not found form JWT")
            }
            const { user: userData, isFederated: isFederatedAuth } = authentication

            let user = await UserModel.findOne({ email: userData.email })
            if (user?.activateEmailToken) {
                if (user?.activateEmailExpires && user.activateEmailExpires < new Date()) {
                    throw new AuthenticationError("User not verified and the invitation is expired, please reset your password")
                }
                throw new AuthenticationError("User not verified, please verify your email")
            }
            if (!user) {
                if (isFederatedAuth) {
                    //Now i will auto provision the user in the system
                    user = await new UserService().register(
                        {
                            email: userData.email,
                            name: userData.name,
                            surname: userData.surname
                        },
                        false
                    )
                } else {
                    throw new AuthenticationError("User found in authentication provider but not in database with email " + userData.email)
                }
            }

            if (isFederatedAuth) {
                // Federated users never call `/users/login`: their token is issued by the
                // provider, so the authentication moment is read from the token itself and
                // this hook is only where it becomes visible. Re-seeing the same token is
                // not a new login, `recordLogin` ignores a moment it already stored.
                const authenticatedAt = getFederatedAuthenticationMoment(authToken)
                await recordLogin(user, authenticatedAt ?? new Date(), authenticatedAt ? 0 : FEDERATED_LOGIN_WINDOW_MS)
            }

            request.databaseUser = {
                ...user.toObject()
            }
        })
    },
    { name: "authorization", dependencies: ["config"] }
)
