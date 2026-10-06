import { FastifyBaseLogger } from "fastify"
import OAuthError from "../errors/OAuthError"
import OAuthClient, { IOAuthClient, OAuthClientRegistrationType } from "../models/OAuthClientModel"
import { fetchClientMetadataDocument, validateClientIdUrl } from "../utils/clientMetadataFetcher"
import { getOAuthConfig, MCP_SCOPES, OAuthConfig } from "../utils/oauthConfig"
import { generateOpaqueToken } from "../utils/pkce"
import { validateRedirectUri } from "../utils/redirectUriPolicy"

/** A registered client nobody authorized within a day is dropped (TTL index on unusedExpiresAt). */
const UNUSED_CLIENT_TTL_MS = 24 * 60 * 60 * 1000
/** How long a fetched metadata document is trusted before it is fetched again. */
const METADATA_CACHE_TTL_MS = 60 * 60 * 1000
const MAX_REDIRECT_URIS = 10
const MAX_CLIENT_NAME_LENGTH = 100

/** Only public clients: MCP clients are native apps or browser apps, none can keep a secret. */
const TOKEN_ENDPOINT_AUTH_METHOD = "none"

export const DCR_CLIENT_ID_PREFIX = "mcp_"

export interface ClientRegistrationResponse {
    client_id: string
    client_id_issued_at: number
    client_name: string
    redirect_uris: string[]
    grant_types: string[]
    response_types: string[]
    token_endpoint_auth_method: string
    scope: string
    client_uri?: string
    logo_uri?: string
    software_id?: string
    software_version?: string
}

const optionalString = (value: unknown, max = 2048): string | undefined => (typeof value === "string" && value.length > 0 && value.length <= max ? value : undefined)

const optionalHttpsUrl = (value: unknown): string | undefined => {
    const candidate = optionalString(value)
    if (!candidate) return undefined
    try {
        return new URL(candidate).protocol === "https:" ? candidate : undefined
    } catch {
        return undefined
    }
}

/**
 * The redirect URIs of a registration or of a metadata document, validated one by one. The error
 * code is the one RFC 7591 §3.2.2 names, so a client can tell this failure from the others.
 */
const parseRedirectUris = (value: unknown): string[] => {
    if (!Array.isArray(value) || value.length === 0) {
        throw new OAuthError("invalid_redirect_uri", "redirect_uris must be a non-empty array")
    }
    if (value.length > MAX_REDIRECT_URIS) {
        throw new OAuthError("invalid_redirect_uri", `at most ${MAX_REDIRECT_URIS} redirect_uris are accepted`)
    }
    for (const uri of value) {
        const problem = validateRedirectUri(uri)
        if (problem) {
            throw new OAuthError("invalid_redirect_uri", problem)
        }
    }
    return [...new Set(value as string[])]
}

/** The name shown on the consent page. A client that gives none is named after where it redirects. */
const parseClientName = (value: unknown, redirectUris: string[]): string => {
    const name = typeof value === "string" ? value.trim() : ""
    if (name.length > 0) {
        return name.slice(0, MAX_CLIENT_NAME_LENGTH)
    }
    try {
        return new URL(redirectUris[0]).host || "MCP client"
    } catch {
        return "MCP client"
    }
}

export class OAuthClientService {
    constructor(
        private readonly config: OAuthConfig = getOAuthConfig(),
        private readonly log?: FastifyBaseLogger
    ) {}

    /**
     * RFC 7591 dynamic registration.
     *
     * Everything in the request is self-asserted, which is why the consent page labels these
     * clients unverified. Values the server does not support are replaced rather than refused,
     * as §3.2.1 allows: the client reads back what it actually got.
     */
    async registerDynamicClient(body: unknown): Promise<ClientRegistrationResponse> {
        const metadata = (body && typeof body === "object" ? body : {}) as Record<string, unknown>
        const redirectUris = parseRedirectUris(metadata.redirect_uris)

        const grantTypes = metadata.grant_types
        if (grantTypes !== undefined && (!Array.isArray(grantTypes) || !grantTypes.includes("authorization_code"))) {
            throw new OAuthError("invalid_client_metadata", "grant_types must include authorization_code")
        }
        const responseTypes = metadata.response_types
        if (responseTypes !== undefined && (!Array.isArray(responseTypes) || !responseTypes.includes("code"))) {
            throw new OAuthError("invalid_client_metadata", "response_types must include code")
        }

        const client = await OAuthClient.create({
            clientId: `${DCR_CLIENT_ID_PREFIX}${generateOpaqueToken()}`,
            registrationType: OAuthClientRegistrationType.DCR,
            clientName: parseClientName(metadata.client_name, redirectUris),
            redirectUris,
            clientUri: optionalHttpsUrl(metadata.client_uri),
            logoUri: optionalHttpsUrl(metadata.logo_uri),
            softwareId: optionalString(metadata.software_id, 200),
            softwareVersion: optionalString(metadata.software_version, 100),
            unusedExpiresAt: new Date(Date.now() + UNUSED_CLIENT_TTL_MS)
        })

        return {
            client_id: client.clientId,
            client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
            client_name: client.clientName,
            redirect_uris: client.redirectUris,
            grant_types: ["authorization_code", "refresh_token"],
            response_types: ["code"],
            token_endpoint_auth_method: TOKEN_ENDPOINT_AUTH_METHOD,
            scope: MCP_SCOPES.join(" "),
            ...(client.clientUri && { client_uri: client.clientUri }),
            ...(client.logoUri && { logo_uri: client.logoUri }),
            ...(client.softwareId && { software_id: client.softwareId }),
            ...(client.softwareVersion && { software_version: client.softwareVersion })
        }
    }

    /**
     * The client behind a `client_id`, or undefined when there is none the server can trust.
     *
     * An https URL is a CIMD client: its metadata is fetched (and cached for an hour) and has to
     * name itself with the very same URL, otherwise anyone could publish a document claiming to be
     * someone else's client. Any other value is looked up among the registered (DCR) clients.
     */
    async resolveClient(clientId: unknown): Promise<IOAuthClient | undefined> {
        if (typeof clientId !== "string" || clientId.length === 0 || clientId.length > 2048) {
            return undefined
        }

        if (!clientId.startsWith("https://")) {
            if (!this.config.dcrEnabled) return undefined
            return (await OAuthClient.findOne({ clientId, registrationType: OAuthClientRegistrationType.DCR })) ?? undefined
        }

        if (!this.config.cimdEnabled || validateClientIdUrl(clientId, this.config.cimdAllowedHosts)) {
            return undefined
        }

        const cached = await OAuthClient.findOne({ clientId, registrationType: OAuthClientRegistrationType.CIMD })
        if (cached?.metadataExpiresAt && cached.metadataExpiresAt > new Date()) {
            return cached
        }

        let document: Record<string, unknown>
        try {
            const fetched = await fetchClientMetadataDocument(clientId)
            if (!fetched || typeof fetched !== "object") throw new Error("client metadata document is not an object")
            document = fetched as Record<string, unknown>
        } catch (error) {
            this.log?.warn({ clientId, err: error }, "Unable to fetch the client metadata document")
            return undefined
        }

        let redirectUris: string[]
        try {
            redirectUris = parseRedirectUris(document.redirect_uris)
        } catch {
            return undefined
        }
        const authMethod = document.token_endpoint_auth_method
        if (document.client_id !== clientId || (authMethod !== undefined && authMethod !== TOKEN_ENDPOINT_AUTH_METHOD)) {
            return undefined
        }

        const updated = await OAuthClient.findOneAndUpdate(
            { clientId },
            {
                $set: {
                    registrationType: OAuthClientRegistrationType.CIMD,
                    clientName: parseClientName(document.client_name, redirectUris),
                    redirectUris,
                    clientUri: optionalHttpsUrl(document.client_uri),
                    logoUri: optionalHttpsUrl(document.logo_uri),
                    softwareId: optionalString(document.software_id, 200),
                    softwareVersion: optionalString(document.software_version, 100),
                    metadataExpiresAt: new Date(Date.now() + METADATA_CACHE_TTL_MS)
                },
                $setOnInsert: { unusedExpiresAt: new Date(Date.now() + UNUSED_CLIENT_TTL_MS) }
            },
            { upsert: true, new: true }
        )
        return updated ?? undefined
    }
}

export default OAuthClientService
