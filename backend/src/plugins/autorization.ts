import axios from "axios"
import { FastifyInstance, FastifyRequest } from "fastify"
import fastifyPlugin from "fastify-plugin"
import jwt, { JwtPayload } from "jsonwebtoken"
import AuthenticationError from "../errors/AuthenticationError"
import ApiKey from "../models/ApiKeyModel"
import UserModel, { getSecret, ISSUER } from "../models/UserModel"
import UserService from "../service/UserService"
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

const getUserDataFromToken = async (fastify: FastifyInstance, authToken: string, issuer: string) => {
    switch (issuer) {
        case "google":
            return getDataFromGoogle(fastify, authToken)
        case "auth0":
            return getDataFromAuth0(fastify, authToken)
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
                return getDataFromLocal(fastify, authToken)
            } else if (payload.iss == `https://login.microsoftonline.com/${fastify.config.AZURE_ENTRAID_TENANT_ID}/v2.0`) {
                return getDataFromMsal(fastify, authToken)
            }
        }
    }
}

const checkApiKey = async (fastify: FastifyInstance, request: FastifyRequest): Promise<string> => {
    const apiKey = request.headers["api-key"] || (request.query as Record<string, unknown>)["apiKey"]
    if (!apiKey || typeof apiKey !== "string") {
        throw new AuthenticationError("API key not found")
    }

    const keys = await ApiKey.find()
    let apiKeyFromDb = undefined
    for (const candidateApiKey of keys) {
        const match = await candidateApiKey.compareApiKey(apiKey)
        if (match) {
            apiKeyFromDb = candidateApiKey
            break
        }
    }

    if (!apiKeyFromDb) {
        throw new AuthenticationError("API key not found")
    }

    return apiKeyFromDb.projectId.toString()
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
                const projectId = await checkApiKey(fastify, request)
                request.headers["project-id"] = projectId
                return
            }

            fastify.log.debug("Authorization is JWT")
            const authToken = request?.headers?.["authorization"]?.replace("Bearer ", "")
            fastify.log.debug({ authToken }, "Auth token")
            if (!authToken) {
                throw new AuthenticationError("Missing or invalid Authorization header")
            }
            const issuer = (request.headers["issuer"] as string) || ISSUER
            const userData = await getUserDataFromToken(fastify, authToken, issuer)
            if (!userData) {
                throw new AuthenticationError("User not found form JWT")
            }

            let user = await UserModel.findOne({ email: userData.email })
            const isFederatedAuth = issuer != ISSUER
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

            request.databaseUser = {
                ...user.toObject()
            }
        })
    },
    { name: "authorization", dependencies: ["config"] }
)
