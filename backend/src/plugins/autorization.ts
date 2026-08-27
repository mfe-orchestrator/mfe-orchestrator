import axios from "axios"
import { FastifyInstance, FastifyRequest } from "fastify"
import fastifyPlugin from "fastify-plugin"
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

const getDataFromGoogle = async (fastify: FastifyInstance, authToken: string): Promise<AuthUserDTO> => {
    if (redisClient) {
        const userFromCache = await redisClient.get(authToken)
        if (userFromCache) {
            return JSON.parse(userFromCache)
        }
    }

    const response = await axios.get(`https://www.googleapis.com/oauth2/v1/tokeninfo`, {
        headers: {
            Authorization: `Bearer ${authToken}`
        }
    })
    if (redisClient) {
        await redisClient.set(authToken, JSON.stringify(response.data), {
            EX: TOKEN_EXPIRATION
        })
    }
    return response.data
}

const getDataFromAuth0 = async (fastify: FastifyInstance, authToken: string): Promise<AuthUserDTO> => {
    const decodedToken = jwt.decode(authToken, { json: true, complete: true })
    if (!decodedToken) {
        throw new AuthenticationError("Invalid token")
    }
    const payload = decodedToken.payload as JwtPayload
    const sub = payload.sub
    if (redisClient && sub) {
        const userFromCache = await redisClient.get(sub)
        if (userFromCache) {
            return JSON.parse(userFromCache)
        }
    }

    const response = await axios.get(`https://${fastify.config.AUTH0_DOMAIN}/userinfo`, {
        headers: {
            Authorization: `Bearer ${authToken}`
        }
    })

    const realResponse = {
        ...response.data,
        name: response.data.family_name,
        surname: response.data.given_name
    }

    if (redisClient && sub) {
        await redisClient.set(sub, JSON.stringify(realResponse), {
            EX: TOKEN_EXPIRATION
        })
    }
    return realResponse
}

const getDataFromLocal = async (fastify: FastifyInstance, authToken: string): Promise<AuthUserDTO> => {
    const decodedToken = jwt.verify(authToken, getSecret(), { complete: true })
    if (!decodedToken) {
        throw new AuthenticationError("Invalid token")
    }
    const payload = decodedToken.payload as JwtPayload
    return { email: payload.email, id: payload.id }
}

const getDataFromMsal = async (fastify: FastifyInstance, authToken: string): Promise<AuthUserDTO> => {
    const decodedToken = jwt.decode(authToken, { json: true, complete: true })
    if (!decodedToken) {
        throw new AuthenticationError("Invalid token")
    }
    const payload = decodedToken.payload as JwtPayload
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
                return { user: await getDataFromMsal(fastify, authToken), isFederated: true }
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
 * Resolves an API key to the project it belongs to, rejecting a key that is revoked
 * or past its expiry.
 *
 * Both conditions are part of the query rather than checked afterwards: the loop below
 * runs one bcrypt comparison per candidate, so narrowing the set is what keeps the cost
 * down as an installation accumulates keys.
 *
 * A key that fails only because it is revoked or expired is looked up a second time, and
 * only to name the reason: "not found" sends whoever configured the pipeline looking for a
 * key that is sitting right there. The caller already holds the key, so saying why it was
 * refused tells them nothing they did not have.
 */
export const checkApiKey = async (request: FastifyRequest): Promise<string> => {
    const apiKey = request.headers["api-key"] || (request.query as Record<string, unknown>)["apiKey"]
    if (!apiKey || typeof apiKey !== "string") {
        throw new AuthenticationError("API key not found")
    }

    const usable = await ApiKey.find({ status: ApiKeyStatus.ACTIVE, expiresAt: { $gt: new Date() } })
    const apiKeyFromDb = await findMatching(usable, apiKey)

    if (apiKeyFromDb) {
        return apiKeyFromDb.projectId.toString()
    }

    const refused = await findMatching(await ApiKey.find({ $or: [{ status: { $ne: ApiKeyStatus.ACTIVE } }, { expiresAt: { $lte: new Date() } }] }), apiKey)

    if (!refused) {
        throw new AuthenticationError("API key not found")
    }

    throw new AuthenticationError(refused.status !== ApiKeyStatus.ACTIVE ? "API key revoked" : `API key expired on ${refused.expiresAt.toISOString()}`)
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
            const authToken = request?.headers?.["authorization"]?.replace("Bearer ", "")
            fastify.log.debug({ authToken }, "Auth token")
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
