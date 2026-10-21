import { isIP } from "node:net"
import { AnthropicBedrockMantle } from "@anthropic-ai/bedrock-sdk"
import AnthropicFoundry from "@anthropic-ai/foundry-sdk"
import Anthropic from "@anthropic-ai/sdk"
import { GoogleGenAI } from "@google/genai"
import OpenAI from "openai"
import { BusinessException, createBusinessException } from "../../errors/BusinessException"
import { AnthropicLlmClient } from "./anthropicProvider"
import { AzureOpenAiLlmClient } from "./azureOpenAiProvider"
import { GeminiLlmClient } from "./geminiProvider"
import { LLM_EFFORTS, LlmClient, LlmEffort, LlmProvider } from "./types"

export * from "./types"

/** The Claude model used when none is configured. */
export const DEFAULT_CLAUDE_MODEL = "claude-opus-5-5"

/** The id of the AI the environment variables describe: one per installation, offered to every organization. */
export const SYSTEM_AI_MODEL_ID = "system"

/** What a provider is reached with, besides the model: each provider reads its own keys of it. */
export interface AiModelConfig {
    apiKey?: string
    /** Azure Foundry: the resource name (https://<resource>.services.ai.azure.com). */
    resource?: string
    /** Azure OpenAI: https://<resource>.openai.azure.com/ */
    endpoint?: string
    /** Azure OpenAI: true for reasoning deployments, which take the effort. */
    reasoning?: boolean
    /** AWS Bedrock. */
    region?: string
    accessKeyId?: string
    secretAccessKey?: string
}

/**
 * One AI as the model layer sees it, whether an organization defined it or the environment variables
 * did: everything needed to build its client and to tell which efforts it takes.
 */
export interface AiModelSettings {
    /** The id of the organization's AI, or {@link SYSTEM_AI_MODEL_ID}. */
    id: string
    name: string
    provider: LlmProvider
    /** The model id, or the deployment name on Azure: the provider's default already applied. */
    model: string
    config: AiModelConfig
    /** The highest effort it serves: unset, every level the provider takes. */
    maxEffort?: LlmEffort
    /** When it last changed: an edited AI gets a new client, with its new key. */
    updatedAt?: Date
}

/** The keys of a config that are a credential: stored encrypted, never sent back. */
export const AI_MODEL_SECRET_KEYS = ["apiKey", "secretAccessKey"] as const

/** The keys of the config each provider reads, the required ones first: anything else is not kept. */
export const AI_MODEL_CONFIG_KEYS: Record<LlmProvider, { required: (keyof AiModelConfig)[]; optional: (keyof AiModelConfig)[] }> = {
    [LlmProvider.ANTHROPIC]: { required: ["apiKey"], optional: [] },
    [LlmProvider.AZURE_FOUNDRY]: { required: ["resource", "apiKey"], optional: [] },
    [LlmProvider.GEMINI]: { required: ["apiKey"], optional: [] },
    [LlmProvider.AZURE_OPENAI]: { required: ["endpoint", "apiKey"], optional: ["reasoning"] },
    [LlmProvider.AWS_BEDROCK]: { required: ["region", "accessKeyId", "secretAccessKey"], optional: [] }
}

/**
 * The model of a provider when none is given, or undefined when it has to be: Claude has a sensible
 * default; Gemini models are retired often, an Azure OpenAI deployment is named by whoever made it and
 * a Bedrock model id depends on the region and the inference profile, so none is assumed for them.
 */
export const defaultModelOf = (provider: LlmProvider): string | undefined => (provider === LlmProvider.ANTHROPIC || provider === LlmProvider.AZURE_FOUNDRY ? DEFAULT_CLAUDE_MODEL : undefined)

/** The Azure hosts an organization's Azure OpenAI endpoint may name, in the public cloud. */
export const AZURE_OPENAI_HOST_SUFFIXES = [".openai.azure.com", ".cognitiveservices.azure.com", ".services.ai.azure.com"]

/** The suffixes above, and those the installation adds for the sovereign clouds (e.g. `.openai.azure.us`). */
export const azureOpenAiHostSuffixes = (installation: Pick<LlmConfiguration, "AZURE_OPENAI_ENDPOINT_SUFFIXES">): string[] => [
    ...AZURE_OPENAI_HOST_SUFFIXES,
    ...(installation.AZURE_OPENAI_ENDPOINT_SUFFIXES ?? "")
        .split(",")
        .map(suffix => suffix.trim().toLowerCase())
        .filter(Boolean)
        .map(suffix => (suffix.startsWith(".") ? suffix : `.${suffix}`))
]

/**
 * Why an organization's Azure OpenAI endpoint is refused, or undefined when it is an Azure host.
 *
 * The server sends the key there and relays what comes back (an error message, an answer): an endpoint
 * left free would let an administrator of an organization reach addresses of the network the server
 * sits in. So only `https://<resource>.<an Azure suffix>/`, nothing more: no IP, no credentials, no
 * other port, no path.
 */
export const azureOpenAiEndpointProblem = (endpoint: string, suffixes: string[]): string | undefined => {
    let url: URL
    try {
        url = new URL(endpoint)
    } catch {
        return "is not a URL"
    }
    if (url.protocol !== "https:") return "is not HTTPS"
    if (url.username || url.password) return "carries credentials"
    if (url.port && url.port !== "443") return "names another port than 443"
    if (url.pathname !== "/" || url.search || url.hash) return "has a path, a query or a fragment"
    const host = url.hostname.toLowerCase()
    if (isIP(host) || host.startsWith("[")) return "is an IP address"
    if (!suffixes.some(suffix => host.endsWith(suffix) && host.length > suffix.length)) return `is not an Azure OpenAI host (${suffixes.join(", ")})`
    return undefined
}

/** The configuration variables the system AI is read from: a subset of `fastify.config`. */
export interface LlmConfiguration {
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
    /** More host suffixes an organization's Azure OpenAI endpoint may name, comma separated: the sovereign clouds'. */
    AZURE_OPENAI_ENDPOINT_SUFFIXES?: string
    AWS_BEDROCK_REGION?: string
    AWS_BEDROCK_ACCESS_KEY_ID?: string
    AWS_BEDROCK_SECRET_ACCESS_KEY?: string
    AWS_BEDROCK_MODEL?: string
    /** The highest effort the system AI serves: unset, every level the provider takes. */
    AI_MAX_EFFORT?: LlmEffort
}

/** Variables each provider cannot work without. */
const REQUIRED: Record<LlmProvider, (keyof LlmConfiguration)[]> = {
    [LlmProvider.ANTHROPIC]: ["ANTHROPIC_API_KEY"],
    [LlmProvider.AZURE_FOUNDRY]: ["AZURE_FOUNDRY_RESOURCE", "AZURE_FOUNDRY_API_KEY"],
    [LlmProvider.GEMINI]: ["GEMINI_API_KEY", "GEMINI_MODEL"],
    [LlmProvider.AZURE_OPENAI]: ["AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_API_KEY", "AZURE_OPENAI_DEPLOYMENT"],
    [LlmProvider.AWS_BEDROCK]: ["AWS_BEDROCK_REGION", "AWS_BEDROCK_ACCESS_KEY_ID", "AWS_BEDROCK_SECRET_ACCESS_KEY", "AWS_BEDROCK_MODEL"]
}

/**
 * The provider of the system AI, or undefined when the environment configures none.
 *
 * AI_PROVIDER picks it. Left unset, an ANTHROPIC_API_KEY alone still turns Claude on, as before
 * the provider could be chosen. A provider named but missing one of its variables is a
 * configuration error, reported at boot rather than at the first question.
 */
export const resolveLlmProvider = (config: LlmConfiguration): LlmProvider | undefined => {
    const named = config.AI_PROVIDER?.trim().toLowerCase()
    if (!named) return config.ANTHROPIC_API_KEY ? LlmProvider.ANTHROPIC : undefined
    const provider = Object.values(LlmProvider).find(candidate => candidate === named)
    if (!provider) {
        throw new Error(`AI_PROVIDER="${config.AI_PROVIDER}" is not one of ${Object.values(LlmProvider).join(", ")}`)
    }
    const missing = REQUIRED[provider].filter(key => !config[key])
    if (missing.length) {
        throw new Error(`AI_PROVIDER=${provider} needs ${missing.join(", ")}`)
    }
    return provider
}

/** The provider's model and config, as the environment variables give them. */
const systemModelAndConfig = (provider: LlmProvider, config: LlmConfiguration): Pick<AiModelSettings, "model" | "config"> => {
    switch (provider) {
        case LlmProvider.ANTHROPIC:
            return { model: config.ANTHROPIC_MODEL || DEFAULT_CLAUDE_MODEL, config: { apiKey: config.ANTHROPIC_API_KEY } }
        case LlmProvider.AZURE_FOUNDRY:
            return { model: config.AZURE_FOUNDRY_MODEL || DEFAULT_CLAUDE_MODEL, config: { resource: config.AZURE_FOUNDRY_RESOURCE, apiKey: config.AZURE_FOUNDRY_API_KEY } }
        case LlmProvider.GEMINI:
            return { model: config.GEMINI_MODEL!, config: { apiKey: config.GEMINI_API_KEY } }
        case LlmProvider.AZURE_OPENAI:
            return {
                model: config.AZURE_OPENAI_DEPLOYMENT!,
                config: { endpoint: config.AZURE_OPENAI_ENDPOINT, apiKey: config.AZURE_OPENAI_API_KEY, reasoning: Boolean(config.AZURE_OPENAI_REASONING) }
            }
        case LlmProvider.AWS_BEDROCK:
            return {
                model: config.AWS_BEDROCK_MODEL!,
                config: { region: config.AWS_BEDROCK_REGION, accessKeyId: config.AWS_BEDROCK_ACCESS_KEY_ID, secretAccessKey: config.AWS_BEDROCK_SECRET_ACCESS_KEY }
            }
    }
}

/**
 * The AI the environment variables describe, or undefined when they describe none. It never changes
 * while the process runs, hence no `updatedAt`. Its name is the console's to translate: it shows it
 * by `system`, not by this name.
 */
export const systemAiModel = (config: LlmConfiguration): AiModelSettings | undefined => {
    const provider = resolveLlmProvider(config)
    if (!provider) return undefined
    return { id: SYSTEM_AI_MODEL_ID, name: "System", provider, ...systemModelAndConfig(provider, config), maxEffort: config.AI_MAX_EFFORT }
}

/**
 * The client of an AI. An organization's AI is checked again here, whatever was stored: without its
 * credentials an SDK would fall back to the keys in the variables of the process, the installation's,
 * and its Azure OpenAI endpoint has to be an Azure host. The system AI is the operator's own.
 */
export const createLlmClient = (settings: AiModelSettings, installation: LlmConfiguration = {}): LlmClient => {
    const { config, model } = settings
    if (settings.id !== SYSTEM_AI_MODEL_ID) {
        const missing = AI_MODEL_CONFIG_KEYS[settings.provider].required.filter(key => !config[key])
        if (missing.length) throw new Error(`The AI ${settings.id} has no ${missing.join(", ")}`)
        const problem = settings.provider === LlmProvider.AZURE_OPENAI ? azureOpenAiEndpointProblem(config.endpoint!, azureOpenAiHostSuffixes(installation)) : undefined
        if (problem) throw new Error(`The endpoint of the AI ${settings.id} ${problem}`)
    }
    switch (settings.provider) {
        case LlmProvider.ANTHROPIC:
            return new AnthropicLlmClient(LlmProvider.ANTHROPIC, new Anthropic({ apiKey: config.apiKey }), model)
        case LlmProvider.AZURE_FOUNDRY:
            return new AnthropicLlmClient(LlmProvider.AZURE_FOUNDRY, new AnthropicFoundry({ resource: config.resource, apiKey: config.apiKey }), model)
        case LlmProvider.AWS_BEDROCK:
            // The Messages API endpoint of Bedrock (Mantle), the one with Claude's current features; the
            // keys are passed explicitly so the AWS variables of the process are never used instead.
            return new AnthropicLlmClient(
                LlmProvider.AWS_BEDROCK,
                new AnthropicBedrockMantle({ awsRegion: config.region, awsAccessKey: config.accessKeyId, awsSecretAccessKey: config.secretAccessKey }),
                model
            )
        case LlmProvider.GEMINI:
            return new GeminiLlmClient(new GoogleGenAI({ apiKey: config.apiKey }), model)
        case LlmProvider.AZURE_OPENAI:
            return new AzureOpenAiLlmClient(
                // The v1 endpoint takes no api-version and the API key as a bearer token.
                // Redirects are not followed: a checked endpoint must not be able to send the key, or the request, elsewhere.
                new OpenAI({ baseURL: new URL("openai/v1/", config.endpoint!.replace(/\/?$/, "/")).toString(), apiKey: config.apiKey, fetchOptions: { redirect: "manual" } }),
                model,
                Boolean(config.reasoning)
            )
    }
}

/** Whether an effort is above the AI's cap. An unknown cap caps nothing. */
const aboveCap = (settings: Pick<AiModelSettings, "maxEffort">, effort: LlmEffort) => {
    const cap = settings.maxEffort ? LLM_EFFORTS.indexOf(settings.maxEffort) : -1
    return cap !== -1 && LLM_EFFORTS.indexOf(effort) > cap
}

/**
 * The effort levels an AI honours, lowest first, up to its maxEffort: the console offers only these.
 * Claude takes them all, wherever it runs; an Azure OpenAI reasoning deployment up to `high`; a
 * deployment that does not reason and Gemini none, as the effort is not sent to them.
 */
export const effortsFor = (settings: Pick<AiModelSettings, "provider" | "config" | "maxEffort">): LlmEffort[] => {
    switch (settings.provider) {
        case LlmProvider.ANTHROPIC:
        case LlmProvider.AZURE_FOUNDRY:
        case LlmProvider.AWS_BEDROCK:
            return LLM_EFFORTS.filter(effort => !aboveCap(settings, effort))
        case LlmProvider.AZURE_OPENAI:
            return settings.config.reasoning ? (["low", "medium", "high"] as const).filter(effort => !aboveCap(settings, effort)) : []
        default:
            return []
    }
}

/**
 * The effort a request is served with: the one asked for, else the default of where it is asked,
 * never above the AI's maxEffort. What is stored and audited is this one, not what the browser sent.
 */
export const resolveEffort = (settings: Pick<AiModelSettings, "maxEffort">, requested: LlmEffort | undefined, fallback: LlmEffort): LlmEffort => {
    const effort = requested ?? fallback
    return aboveCap(settings, effort) ? settings.maxEffort! : effort
}

/** Codes OpenAI-compatible providers put on errors sent mid-stream, which carry no HTTP status: Azure sends `no_capacity` when peak load rejects a large request. */
const RATE_LIMIT_CODES = new Set(["rate_limit_exceeded", "no_capacity"])

/**
 * A 429 from the provider, or a rate-limit code on an error sent mid-stream. Every SDK in use exposes the HTTP status as `status` on its errors.
 * Azure's token quota, hit mid-stream, may come with neither: only its message tells ("Your requests to … have exceeded token rate limit").
 */
export const isRateLimitError = (error: unknown): boolean => {
    const { status, code, message } = (error ?? {}) as { status?: unknown; code?: unknown; message?: unknown }
    return status === 429 || (typeof code === "string" && RATE_LIMIT_CODES.has(code)) || (typeof message === "string" && /rate limit/i.test(message))
}

/**
 * What the user is told of a provider that failed: never the provider's own message, which may quote
 * what the endpoint answered. Rate limits keep a code of their own, as the console tells them apart.
 * The caller logs the real error.
 */
export const aiProviderError = (error: unknown): BusinessException =>
    isRateLimitError(error)
        ? createBusinessException({ code: "RATE_LIMITED", message: "The AI provider is rate limiting the requests: try again in a few minutes", statusCode: 429 })
        : createBusinessException({ code: "AI_PROVIDER_ERROR", message: "The AI provider could not answer: try again later", statusCode: 502 })

/** One client per AI and version of it: the latest one only, since an edit makes the previous one useless. */
const clients = new Map<string, { version: string; client: LlmClient }>()

/**
 * The client of an AI, built on first use so an AI nobody asks anything never builds one, and built
 * again once the AI is edited: its key or its model may have changed. The system AI has no edit date:
 * what it is configured with tells its versions apart.
 */
export const getLlmClient = (settings: AiModelSettings, installation: LlmConfiguration = {}): LlmClient => {
    const version = settings.updatedAt ? String(settings.updatedAt.getTime()) : JSON.stringify([settings.provider, settings.model, settings.config])
    const cached = clients.get(settings.id)
    if (cached && cached.version === version) return cached.client
    const client = createLlmClient(settings, installation)
    clients.set(settings.id, { version, client })
    return client
}

/** Drops the client of a deleted AI, and the credentials it holds. */
export const forgetLlmClient = (id: string): void => {
    clients.delete(id)
}
