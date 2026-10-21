import fastifyEnv from "@fastify/env"
import dotenv from "dotenv"
import { FastifyInstance, FastifyPluginOptions } from "fastify"
import fastifyPlugin from "fastify-plugin"
import { LlmConfiguration, resolveLlmProvider } from "../service/llm"
import { assertMcpConfigurationIsUsable } from "../utils/oauthConfig"
import { assertSecretEncryptionKeyIsUsable, isSecretEncryptionEnabled } from "../utils/secretCrypto"
import { TELEMETRY_DEFAULT_ENDPOINT, TELEMETRY_DEFAULT_INTERVAL_HOURS } from "../utils/telemetry"

dotenv.config()

const NODE_ENVS = Object.freeze<string[]>(["development", "prod", "test", "local"])

export default fastifyPlugin(
    (fastify: FastifyInstance, _options: FastifyPluginOptions, done: (err?: Error | undefined) => void) => {
        const schema = {
            type: "object",
            required: [],
            properties: {
                NOSQL_DATABASE_URL: {
                    type: "string"
                },
                NOSQL_DATABASE_USERNAME: {
                    type: "string"
                },
                NOSQL_DATABASE_PASSWORD: {
                    type: "string"
                },
                NOSQL_DATABASE_NAME: {
                    type: "string"
                },
                REGISTRATION_ALLOWED: {
                    type: "boolean",
                    default: true
                },
                // Richieste per IP al minuto. Non impostata vale 100, come prima che
                // fosse configurabile.
                RATE_LIMIT_MAX: {
                    type: "number",
                    default: 100
                },
                ALLOW_EMBEDDED_LOGIN: {
                    type: "boolean",
                    default: true
                },
                REDIS_URL: {
                    type: "string"
                },
                REDIS_PASSWORD: {
                    type: "string"
                },
                EMAIL_SMTP_HOST: {
                    type: "string"
                },
                EMAIL_SMTP_PORT: {
                    type: "number",
                    default: 587
                },
                EMAIL_SMTP_SECURE: {
                    type: "boolean",
                    default: false
                },
                EMAIL_SMTP_USER: {
                    type: "string"
                },
                EMAIL_SMTP_PASSWORD: {
                    type: "string"
                },
                EMAIL_SMTP_FROM: {
                    type: "string"
                },
                FRONTEND_URL: {
                    type: "string"
                },
                BACKEND_URL: {
                    type: "string"
                },
                AUTH0_DOMAIN: {
                    type: "string"
                },
                AUTH0_CLIENT_ID: {
                    type: "string"
                },
                AUTH0_SCOPE: {
                    type: "string",
                    default: "openid profile email"
                },
                AUTH0_AUDIENCE: {
                    type: "string"
                },
                ALLOWED_ORIGINS: {
                    type: "string"
                },
                // Allow-list dedicata agli endpoint /serve/*. Se non impostata
                // si ricade su ALLOWED_ORIGINS.
                ALLOWED_SERVE_ORIGINS: {
                    type: "string"
                },
                AZURE_ENTRAID_TENANT_ID: {
                    type: "string"
                },
                AZURE_ENTRAID_CLIENT_ID: {
                    type: "string"
                },
                AZURE_ENTRAID_REDIRECT_URI: {
                    type: "string"
                },
                AZURE_ENTRAID_AUTHORITY: {
                    type: "string",
                    default: "https://login.microsoftonline.com"
                },
                AZURE_ENTRAID_SCOPES: {
                    type: "string",
                    default: "openid profile email"
                },
                AZURE_ENTRAID_API_AUDIENCE: {
                    type: "string"
                },
                GOOGLE_CLIENT_ID: {
                    type: "string"
                },
                GOOGLE_CLIENT_SECRET: {
                    type: "string"
                },
                GOOGLE_REDIRECT_URI: {
                    type: "string"
                },
                GOOGLE_AUTH_SCOPE: {
                    type: "string",
                    default: "https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile"
                },
                GOOGLE_AUTH_HOSTED_DOMAIN: {
                    type: "string",
                    default: ""
                },
                GOOGLE_API_AUDIENCE: {
                    type: "string"
                },
                HOST: {
                    type: "string"
                },
                NOSQL_DB_URL: {
                    type: "string"
                },
                NOSQL_DB_DATABASE: {
                    type: "string"
                },
                NOSQL_DB_PASSWORD: {
                    type: "string"
                },
                PORT: {
                    type: "number",
                    default: 3000
                },
                NODE_ENV: {
                    type: "string",
                    default: "prod"
                },
                MICROFRONTEND_HOST_FOLDER: {
                    type: "string",
                    default: "/upload-microfrontends"
                },
                // 32 bytes, base64 or hex, encrypting the credentials the console stores for a
                // project: bucket keys, storage connection strings, repository tokens. Unset, they
                // are written in the clear as before. See docs/SECRETS.md.
                SECRETS_ENCRYPTION_KEY: {
                    type: "string"
                },
                CODE_REPOSITORY_GITHUB_CLIENT_ID: {
                    type: "string"
                },
                CODE_REPOSITORY_GITHUB_CLIENT_SECRET: {
                    type: "string"
                },
                // The marketing opt-in is off unless the operator turns it on. An
                // installation that has no mailing list must not ask for a consent it
                // would never use, and the platform never sends commercial email
                // itself in either case: it only records that the consent was given.
                MARKETING_OPT_IN_ENABLED: {
                    type: "boolean",
                    default: false
                },
                // Version of the consent text shown at registration, stored together
                // with the consent. Without it an old consent cannot be attributed to
                // the wording that was actually accepted.
                MARKETING_OPT_IN_VERSION: {
                    type: "string",
                    default: "1"
                },
                // Telemetry switches are strings and not booleans on purpose: they
                // have three states (unset, on, off) and a malformed value must
                // never keep the application from starting. See docs/TELEMETRY.md.
                TELEMETRY_ENABLED: {
                    type: "string"
                },
                TELEMETRY_DISABLED: {
                    type: "string"
                },
                DO_NOT_TRACK: {
                    type: "string"
                },
                TELEMETRY_ENDPOINT: {
                    type: "string",
                    default: TELEMETRY_DEFAULT_ENDPOINT
                },
                TELEMETRY_INTERVAL_HOURS: {
                    type: "number",
                    default: TELEMETRY_DEFAULT_INTERVAL_HOURS
                },
                // Remote MCP server and the OAuth authorization server in front of it. Off until
                // the operator turns it on: see docs/MCP.md.
                MCP_ENABLED: {
                    type: "boolean",
                    default: false
                },
                // Overrides for when the public URLs cannot be derived from BACKEND_URL/FRONTEND_URL.
                OAUTH_ISSUER_URL: {
                    type: "string"
                },
                MCP_RESOURCE_URL: {
                    type: "string"
                },
                // Dynamic client registration (RFC 7591) and client metadata documents: both on by
                // default, as every MCP client in circulation relies on one or the other.
                MCP_DCR_ENABLED: {
                    type: "boolean",
                    default: true
                },
                MCP_CIMD_ENABLED: {
                    type: "boolean",
                    default: true
                },
                // Lets clients that cannot do OAuth use a project API key on /mcp instead.
                MCP_API_KEY_ENABLED: {
                    type: "boolean",
                    default: true
                },
                // Lets a project hand its GitOps repositories to an Argo CD served over plain http: for a local cluster only,
                // as the token of Argo CD and the repository credentials would cross the network in the clear.
                ARGOCD_ALLOW_INSECURE_HTTP: {
                    type: "boolean",
                    default: false
                },
                // MCP requests per minute for each grant or API key, on top of RATE_LIMIT_MAX per IP.
                MCP_RATE_LIMIT_MAX: {
                    type: "number",
                    default: 120
                },
                // Comma separated hosts allowed to publish a client metadata document. Empty: any.
                CIMD_ALLOWED_HOSTS: {
                    type: "string"
                },
                // Read before this plugin runs (Fastify takes it at construction), listed here so
                // the schema documents every variable the backend reads.
                TRUST_PROXY: {
                    type: "string"
                },
                // The system AI, offered to every organization next to the ones it defines: anthropic,
                // azure-foundry, gemini, azure-openai or aws-bedrock. Unset, an ANTHROPIC_API_KEY alone
                // turns Claude on; with neither there is no system AI, and a project whose organization
                // defines none has AI off: its endpoints answer 404 and nothing is sent anywhere.
                AI_PROVIDER: {
                    type: "string"
                },
                ANTHROPIC_API_KEY: {
                    type: "string"
                },
                // Defaults to claude-opus-5-5.
                ANTHROPIC_MODEL: {
                    type: "string"
                },
                // Claude on Microsoft Foundry: the resource name (https://<resource>.services.ai.azure.com).
                AZURE_FOUNDRY_RESOURCE: {
                    type: "string"
                },
                AZURE_FOUNDRY_API_KEY: {
                    type: "string"
                },
                // The deployment name of the Claude model on Foundry. Defaults to claude-opus-5-5.
                AZURE_FOUNDRY_MODEL: {
                    type: "string"
                },
                GEMINI_API_KEY: {
                    type: "string"
                },
                // Required with gemini: Gemini models are retired often, so none is assumed.
                GEMINI_MODEL: {
                    type: "string"
                },
                // Azure OpenAI: https://<resource>.openai.azure.com/
                AZURE_OPENAI_ENDPOINT: {
                    type: "string"
                },
                AZURE_OPENAI_API_KEY: {
                    type: "string"
                },
                // The deployment of the GPT model, which is also the model name.
                AZURE_OPENAI_DEPLOYMENT: {
                    type: "string"
                },
                // True for reasoning deployments (o-series, GPT-5 and later): the effort is sent as reasoning.effort.
                AZURE_OPENAI_REASONING: {
                    type: "boolean",
                    default: false
                },
                // The host suffixes an organization's Azure OpenAI endpoint may name besides the public
                // cloud's (.openai.azure.com, .cognitiveservices.azure.com, .services.ai.azure.com), comma
                // separated: the sovereign clouds', e.g. .openai.azure.us,.openai.azure.cn
                AZURE_OPENAI_ENDPOINT_SUFFIXES: {
                    type: "string"
                },
                // Claude on Amazon Bedrock: the region, an access key allowed to invoke the model, and
                // the model id or inference profile (e.g. anthropic.claude-opus-5-5), required.
                AWS_BEDROCK_REGION: {
                    type: "string"
                },
                AWS_BEDROCK_ACCESS_KEY_ID: {
                    type: "string"
                },
                AWS_BEDROCK_SECRET_ACCESS_KEY: {
                    type: "string"
                },
                AWS_BEDROCK_MODEL: {
                    type: "string"
                },
                // The highest reasoning effort users may choose with the system AI: low, medium, high, xhigh
                // or max. Higher efforts take more tokens per answer; unset, every level the model takes is offered.
                AI_MAX_EFFORT: {
                    type: "string",
                    enum: ["low", "medium", "high", "xhigh", "max"]
                },
                // Assistant questions per IP per minute. Each one is a paid model call, so
                // the ceiling is separate from, and lower than, RATE_LIMIT_MAX.
                ASSISTANT_RATE_LIMIT_MAX: {
                    type: "number",
                    default: 20
                },
                // Where the repositories behind the microfrontends are cloned to be edited with AI,
                // as <org>/<project>/<microfrontend>. A cache: deleting it only costs a new clone.
                REPOSITORIES_FOLDER: {
                    type: "string",
                    default: "/repositories"
                },
                // A repository bigger than this on disk is refused, and removed, after the clone.
                REPOSITORIES_MAX_SIZE_MB: {
                    type: "number",
                    default: 500
                },
                // Working copies not used for this many days are deleted.
                REPOSITORIES_EVICT_AFTER_DAYS: {
                    type: "number",
                    default: 14
                }
            }
        }

        const configOptions = {
            // decorate the Fastify server instance with `config` key
            // such as `fastify.config('PORT')
            confKey: "config",
            // schema to validate
            schema: schema,
            // source for the configuration data
            data: process.env,
            // will read .env in root folder
            dotenv: true,
            // will remove the additional properties
            // from the data object which creates an
            // explicit schema
            removeAdditional: true
        }

        /* istanbul ignore next */
        if (NODE_ENVS.find(validName => validName === (process.env.NODE_ENV ?? "prod")) === undefined) {
            throw new Error("NODE_ENV is not valid, it must be one of 'prod', 'test' or 'local', not \"" + process.env.NODE_ENV + '"')
        }

        // A key of the wrong length has to stop the boot: letting it through would produce an
        // application that starts and then fails on the first storage it touches, which reads as a
        // broken bucket rather than as a typo in the environment.
        assertSecretEncryptionKeyIsUsable()

        // Same reasoning: a MCP server signing with the public fallback secret must not come up at all.
        assertMcpConfigurationIsUsable()

        // A provider named without its credentials fails here, not at the first question. Read from
        // the environment like the checks above: fastify.config is only filled in by fastifyEnv below.
        resolveLlmProvider(process.env as LlmConfiguration)

        if (!isSecretEncryptionEnabled()) {
            fastify.log.warn("SECRETS_ENCRYPTION_KEY is not set: storage credentials and repository tokens are stored unencrypted. See docs/SECRETS.md")
        }

        fastifyEnv(fastify, configOptions, done)
    },
    { name: "config" }
)
