import { FastifyInstance, FastifyReply } from "fastify"
import OAuthError from "../errors/OAuthError"
import { IUser } from "../models/UserModel"
import OAuthAuthorizationService from "../service/OAuthAuthorizationService"
import OAuthClientService from "../service/OAuthClientService"
import AuthenticationMethod from "../types/AuthenticationMethod"
import { getOAuthConfig } from "../utils/oauthConfig"

/**
 * The OAuth 2.1 authorization server in front of the MCP server.
 *
 * The console login is the identity provider: `/oauth/authorize` parks the request and sends the
 * browser to the SPA's consent page, which signs the user in as usual and then talks to the
 * `/oauth/requests/*` routes with the console session. Nothing here exists unless MCP_ENABLED.
 */
export default async function oauthController(fastify: FastifyInstance) {
    const config = getOAuthConfig()
    if (!config.enabled) {
        return
    }

    const authorization = () => new OAuthAuthorizationService(config, fastify.log)
    const publicRoute = { config: { authMethod: AuthenticationMethod.PUBLIC } }

    // The token and revocation endpoints speak form encoding (RFC 6749 §4.1.3). Registered in this
    // controller's own scope, so the rest of the API keeps accepting JSON only.
    fastify.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_request, body, done) => {
        done(null, Object.fromEntries(new URLSearchParams(body as string)))
    })

    /** OAuth clients parse `error`/`error_description`, not the console's error envelope. */
    const answerOAuth = async (reply: FastifyReply, work: () => Promise<unknown>, successStatus = 200) => {
        reply.header("Cache-Control", "no-store").header("Pragma", "no-cache")
        try {
            return reply.code(successStatus).send(await work())
        } catch (error) {
            if (OAuthError.isInstance(error)) {
                return reply.code(error.statusCode).send(error.toResponse())
            }
            throw error
        }
    }

    if (config.dcrEnabled) {
        // Anyone can register, so registration is the cheapest thing to abuse: 10 an hour per IP
        // is plenty for a person setting up their clients.
        fastify.post("/oauth/register", { config: { authMethod: AuthenticationMethod.PUBLIC, rateLimit: { max: 10, timeWindow: "1 hour" } } }, async (request, reply) =>
            answerOAuth(reply, () => new OAuthClientService(config, fastify.log).registerDynamicClient(request.body), 201)
        )
    }

    fastify.get<{ Querystring: Record<string, unknown> }>("/oauth/authorize", publicRoute, async (request, reply) => {
        return reply.redirect(await authorization().startAuthorization(request.query ?? {}))
    })

    fastify.post<{ Body: Record<string, unknown> }>("/oauth/token", publicRoute, async (request, reply) => {
        const params = request.body ?? {}
        return answerOAuth(reply, () => {
            switch (params.grant_type) {
                case "authorization_code":
                    return authorization().exchangeAuthorizationCode(params)
                case "refresh_token":
                    return authorization().refresh(params)
                default:
                    throw new OAuthError("unsupported_grant_type", "Supported grant types: authorization_code, refresh_token")
            }
        })
    })

    fastify.post<{ Body: Record<string, unknown> }>("/oauth/revoke", publicRoute, async (request, reply) => {
        return answerOAuth(reply, async () => {
            await authorization().revoke(request.body ?? {})
            return {}
        })
    })

    // The consent page's API: authenticated with the console session, like the rest of the SPA
    fastify.get<{ Params: { handle: string } }>("/oauth/requests/:handle", async (request, reply) => {
        return reply.header("Cache-Control", "no-store").send(await authorization().getRequestForConsent(request.params.handle, request.databaseUser as unknown as IUser))
    })

    fastify.post<{ Params: { handle: string }; Body: { projectId?: string; scopes?: string[] } }>("/oauth/requests/:handle/approve", async (request, reply) => {
        return reply.send(await authorization().approve(request.params.handle, request.databaseUser as unknown as IUser, request.body ?? {}))
    })

    fastify.post<{ Params: { handle: string } }>("/oauth/requests/:handle/deny", async (request, reply) => {
        return reply.send(await authorization().deny(request.params.handle, request.databaseUser as unknown as IUser))
    })
}
