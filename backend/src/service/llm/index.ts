import AnthropicFoundry from "@anthropic-ai/foundry-sdk"
import Anthropic from "@anthropic-ai/sdk"
import { GoogleGenAI } from "@google/genai"
import OpenAI from "openai"
import AssistantDisabledError from "../../errors/AssistantDisabledError"
import { AnthropicLlmClient } from "./anthropicProvider"
import { AzureOpenAiLlmClient } from "./azureOpenAiProvider"
import { GeminiLlmClient } from "./geminiProvider"
import { LLM_EFFORTS, LlmClient, LlmEffort, LlmProvider } from "./types"

export * from "./types"

/** The Claude model used when none is configured. */
export const DEFAULT_CLAUDE_MODEL = "claude-opus-5-5"

/** The configuration variables the model is read from: a subset of `fastify.config`. */
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
    /** The highest effort the installation serves: unset, every level the provider takes. */
    AI_MAX_EFFORT?: LlmEffort
}

/** Variables each provider cannot work without. */
const REQUIRED: Record<LlmProvider, (keyof LlmConfiguration)[]> = {
    [LlmProvider.ANTHROPIC]: ["ANTHROPIC_API_KEY"],
    [LlmProvider.AZURE_FOUNDRY]: ["AZURE_FOUNDRY_RESOURCE", "AZURE_FOUNDRY_API_KEY"],
    [LlmProvider.GEMINI]: ["GEMINI_API_KEY", "GEMINI_MODEL"],
    [LlmProvider.AZURE_OPENAI]: ["AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_API_KEY", "AZURE_OPENAI_DEPLOYMENT"]
}

/**
 * The provider in use, or undefined when AI is off.
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

export const isLlmEnabled = (config: LlmConfiguration): boolean => {
    try {
        return Boolean(resolveLlmProvider(config))
    } catch {
        return false
    }
}

export const createLlmClient = (config: LlmConfiguration): LlmClient | undefined => {
    switch (resolveLlmProvider(config)) {
        case LlmProvider.ANTHROPIC:
            return new AnthropicLlmClient(LlmProvider.ANTHROPIC, new Anthropic({ apiKey: config.ANTHROPIC_API_KEY }), config.ANTHROPIC_MODEL || DEFAULT_CLAUDE_MODEL)
        case LlmProvider.AZURE_FOUNDRY:
            return new AnthropicLlmClient(
                LlmProvider.AZURE_FOUNDRY,
                new AnthropicFoundry({ resource: config.AZURE_FOUNDRY_RESOURCE, apiKey: config.AZURE_FOUNDRY_API_KEY }),
                config.AZURE_FOUNDRY_MODEL || DEFAULT_CLAUDE_MODEL
            )
        case LlmProvider.GEMINI:
            return new GeminiLlmClient(new GoogleGenAI({ apiKey: config.GEMINI_API_KEY }), config.GEMINI_MODEL!)
        case LlmProvider.AZURE_OPENAI:
            return new AzureOpenAiLlmClient(
                // The v1 endpoint takes no api-version and the API key as a bearer token.
                new OpenAI({ baseURL: new URL("openai/v1/", config.AZURE_OPENAI_ENDPOINT!.replace(/\/?$/, "/")).toString(), apiKey: config.AZURE_OPENAI_API_KEY }),
                config.AZURE_OPENAI_DEPLOYMENT!,
                Boolean(config.AZURE_OPENAI_REASONING)
            )
        default:
            return undefined
    }
}

/** Whether an effort is above the installation's cap. An unknown cap caps nothing. */
const aboveCap = (config: LlmConfiguration, effort: LlmEffort) => {
    const cap = config.AI_MAX_EFFORT ? LLM_EFFORTS.indexOf(config.AI_MAX_EFFORT) : -1
    return cap !== -1 && LLM_EFFORTS.indexOf(effort) > cap
}

/**
 * The effort levels the configured provider honours, lowest first, up to AI_MAX_EFFORT: the console
 * offers only these. Claude takes them all; an Azure OpenAI reasoning deployment up to `high`; a
 * deployment that does not reason and Gemini none, as the effort is not sent to them.
 */
export const effortsFor = (config: LlmConfiguration): LlmEffort[] => {
    let provider: LlmProvider | undefined
    try {
        provider = resolveLlmProvider(config)
    } catch {
        return []
    }
    switch (provider) {
        case LlmProvider.ANTHROPIC:
        case LlmProvider.AZURE_FOUNDRY:
            return LLM_EFFORTS.filter(effort => !aboveCap(config, effort))
        case LlmProvider.AZURE_OPENAI:
            return config.AZURE_OPENAI_REASONING ? (["low", "medium", "high"] as const).filter(effort => !aboveCap(config, effort)) : []
        default:
            return []
    }
}

/**
 * The effort a request is served with: the one asked for, else the default of where it is asked,
 * never above AI_MAX_EFFORT. What is stored and audited is this one, not what the browser sent.
 */
export const resolveEffort = (config: LlmConfiguration, requested: LlmEffort | undefined, fallback: LlmEffort): LlmEffort => {
    const effort = requested ?? fallback
    return aboveCap(config, effort) ? config.AI_MAX_EFFORT! : effort
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

let cached: { config: LlmConfiguration; client: LlmClient } | undefined

/** One client per process, built on first use so an installation without AI never builds one. */
export const getLlmClient = (config: LlmConfiguration): LlmClient => {
    if (cached?.config === config) return cached.client
    const client = createLlmClient(config)
    if (!client) throw new AssistantDisabledError()
    cached = { config, client }
    return client
}
