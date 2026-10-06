import { FastifyInstance } from "fastify"
import AuthenticationMethod from "../types/AuthenticationMethod"
import { getOAuthConfig, MCP_SCOPES, OAuthConfig } from "../utils/oauthConfig"

/** RFC 9728 protected resource metadata: which authorization server issues tokens for /mcp. */
export const buildProtectedResourceMetadata = (config: OAuthConfig) => ({
    resource: config.resource,
    authorization_servers: [config.issuer],
    scopes_supported: [...MCP_SCOPES],
    bearer_methods_supported: ["header"],
    resource_name: "MFE Orchestrator"
})

/** RFC 8414 authorization server metadata. Public clients with PKCE S256 only. */
export const buildAuthorizationServerMetadata = (config: OAuthConfig) => ({
    issuer: config.issuer,
    authorization_endpoint: `${config.issuer}/oauth/authorize`,
    token_endpoint: `${config.issuer}/oauth/token`,
    revocation_endpoint: `${config.issuer}/oauth/revoke`,
    ...(config.dcrEnabled && { registration_endpoint: `${config.issuer}/oauth/register` }),
    scopes_supported: [...MCP_SCOPES],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    authorization_response_iss_parameter_supported: true,
    client_id_metadata_document_supported: config.cimdEnabled
})

/**
 * The discovery documents, mounted at the root of the backend and not under the controllers'
 * prefix: well-known URIs live at the origin root by definition (RFC 8615), with the issuer or
 * resource path appended after them, so /api/... would never be found by a client. Behind nginx
 * the same documents are also reachable as /api/.well-known/..., which is harmless.
 */
export default async function wellKnownRoutes(fastify: FastifyInstance) {
    const config = getOAuthConfig()
    if (!config.enabled) {
        return
    }

    const routeOptions = { config: { authMethod: AuthenticationMethod.PUBLIC } }

    // One resource and one issuer per installation: the path suffix only exists because of how
    // the URL is built, so every suffix answers with the same document.
    for (const path of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/*"]) {
        fastify.get(path, routeOptions, async (_request, reply) => reply.header("Cache-Control", "public, max-age=300").send(buildProtectedResourceMetadata(config)))
    }

    for (const path of ["/.well-known/oauth-authorization-server", "/.well-known/oauth-authorization-server/*", "/.well-known/openid-configuration", "/.well-known/openid-configuration/*"]) {
        fastify.get(path, routeOptions, async (_request, reply) => reply.header("Cache-Control", "public, max-age=300").send(buildAuthorizationServerMetadata(config)))
    }
}
