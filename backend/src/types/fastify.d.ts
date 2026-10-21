import { FastifyMultipartFile } from "@fastify/multipart"
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import { Authenticate } from "fastify-auth0-verify"
import { ApiKeyRole } from "../models/ApiKeyModel"
import UserModel from "../models/UserModel"
import type { LlmEffort } from "../service/llm/types"
import { FastifyInstanceWithConfig } from "./index"
import { TelemetryDecisionDTO } from "./TelemetryDTO"

/** Telemetry state resolved once at boot and shared with the controller. */
export interface TelemetryRuntimeConfiguration extends TelemetryDecisionDTO {
    endpoint: string
    intervalHours: number
}

export interface FastifyRequestWithConfig extends FastifyRequest {
    config: FastifyInstanceWithConfig["config"]
}

export interface FastifyReplyWithConfig extends FastifyReply {
    config: FastifyInstanceWithConfig["config"]
}

export interface FastifyMultipartRequest extends FastifyRequest {
    file: FastifyMultipartFile
}

declare module "fastify" {
    interface FastifyInstance {
        authenticate: Authenticate
        config: {
            PORT: number
            NOSQL_DATABASE_URL: string
            NOSQL_DATABASE_USERNAME: string
            NOSQL_DATABASE_PASSWORD: string
            NOSQL_DATABASE_NAME: string
            AUTH0_DOMAIN: string
            AUTH0_CLIENT_ID: string
            AUTH0_AUDIENCE: string
            AUTH0_SCOPE: string
            ALLOWED_ORIGINS: string
            ALLOWED_SERVE_ORIGINS?: string
            REGISTRATION_ALLOWED: boolean
            ALLOW_EMBEDDED_LOGIN: boolean
            RATE_LIMIT_MAX: number
            REDIS_URL: string
            REDIS_PASSWORD: string
            EMAIL_SMTP_HOST: string
            EMAIL_SMTP_PORT: number
            EMAIL_SMTP_SECURE: boolean
            EMAIL_SMTP_USER: string
            EMAIL_SMTP_PASSWORD: string
            EMAIL_SMTP_FROM: string
            FRONTEND_URL: string
            BACKEND_URL: string
            HOST: string
            NODE_ENV: string
            AZURE_ENTRAID_TENANT_ID: string
            AZURE_ENTRAID_CLIENT_ID: string
            AZURE_ENTRAID_REDIRECT_URI: string
            AZURE_ENTRAID_AUTHORITY: string
            AZURE_ENTRAID_SCOPES: string
            AZURE_ENTRAID_API_AUDIENCE: string
            GOOGLE_CLIENT_ID: string
            GOOGLE_CLIENT_SECRET: string
            GOOGLE_REDIRECT_URI: string
            GOOGLE_AUTH_SCOPE: string
            GOOGLE_AUTH_HOSTED_DOMAIN: string
            GOOGLE_API_AUDIENCE: string
            MICROFRONTEND_HOST_FOLDER: string
            CODE_REPOSITORY_GITHUB_CLIENT_ID: string
            CODE_REPOSITORY_GITHUB_CLIENT_SECRET: string
            MARKETING_OPT_IN_ENABLED: boolean
            MARKETING_OPT_IN_VERSION: string
            TELEMETRY_ENABLED?: string
            TELEMETRY_DISABLED?: string
            DO_NOT_TRACK?: string
            TELEMETRY_ENDPOINT: string
            TELEMETRY_INTERVAL_HOURS: number
            MCP_ENABLED: boolean
            OAUTH_ISSUER_URL?: string
            MCP_RESOURCE_URL?: string
            MCP_DCR_ENABLED: boolean
            MCP_CIMD_ENABLED: boolean
            MCP_API_KEY_ENABLED: boolean
            ARGOCD_ALLOW_INSECURE_HTTP: boolean
            MCP_RATE_LIMIT_MAX: number
            CIMD_ALLOWED_HOSTS?: string
            TRUST_PROXY?: string
            AI_PROVIDER?: string
            ANTHROPIC_API_KEY?: string
            ANTHROPIC_MODEL?: string
            AZURE_FOUNDRY_RESOURCE?: string
            AZURE_FOUNDRY_API_KEY?: string
            AZURE_FOUNDRY_MODEL?: string
            GEMINI_API_KEY?: string
            GEMINI_MODEL?: string
            AZURE_OPENAI_ENDPOINT?: string
            AZURE_OPENAI_API_KEY?: string
            AZURE_OPENAI_DEPLOYMENT?: string
            AZURE_OPENAI_REASONING?: boolean
            AZURE_OPENAI_ENDPOINT_SUFFIXES?: string
            AWS_BEDROCK_REGION?: string
            AWS_BEDROCK_ACCESS_KEY_ID?: string
            AWS_BEDROCK_SECRET_ACCESS_KEY?: string
            AWS_BEDROCK_MODEL?: string
            AI_MAX_EFFORT?: LlmEffort
            REPOSITORIES_FOLDER: string
            REPOSITORIES_MAX_SIZE_MB: number
            REPOSITORIES_EVICT_AFTER_DAYS: number
            ASSISTANT_RATE_LIMIT_MAX: number
        }
        telemetry: TelemetryRuntimeConfiguration
    }

    interface FastifyRequest {
        databaseUser: UserModel
        /** Set on API key routes only: the role of the key the request carried */
        apiKeyRole?: ApiKeyRole
    }

    interface FastifyContextConfig {
        grants?: string[]
        authMethod: AuthenticationMethod
    }
}

export type AppInstance = FastifyInstance
