/**
 * The model behind the assistant and the AI code changes, whichever provider serves it.
 *
 * Kept to what the console actually uses: a turn of a tool-calling conversation, streamed, and a
 * single request answered with JSON matching a schema. Every provider adapter maps these shapes to
 * its own API and back.
 */

export enum LlmProvider {
    /** Claude through the Anthropic API. */
    ANTHROPIC = "anthropic",
    /** Claude deployed on Microsoft Foundry (Azure). */
    AZURE_FOUNDRY = "azure-foundry",
    /** Gemini through the Gemini API. */
    GEMINI = "gemini",
    /** GPT models deployed on Azure OpenAI. */
    AZURE_OPENAI = "azure-openai",
    /** Claude on Amazon Bedrock. */
    AWS_BEDROCK = "aws-bedrock"
}

export interface LlmTool {
    name: string
    description: string
    /** JSON Schema of the input object. */
    inputSchema: Record<string, unknown>
}

export interface LlmToolCall {
    id: string
    name: string
    input: Record<string, unknown>
}

export interface LlmToolResult {
    callId: string
    name: string
    content: string
    isError?: boolean
}

export type LlmMessage =
    | { role: "user"; text: string }
    /**
     * `native` is the turn exactly as the provider returned it. It is sent back as is: Claude's
     * thinking blocks and Gemini's thought signatures must come back unchanged on the next request,
     * or the provider rejects it or loses the reasoning of the turn. It is only read by the
     * adapter that produced it.
     */
    | { role: "assistant"; text: string; toolCalls: LlmToolCall[]; native?: unknown }
    | { role: "tool"; results: LlmToolResult[] }

/** How hard the model reasons before answering, lowest first: more effort, deeper reasoning, slower answers and more tokens. */
export type LlmEffort = "low" | "medium" | "high" | "xhigh" | "max"

/** Every level, lowest first: the enum of the request schemas. */
export const LLM_EFFORTS: readonly LlmEffort[] = ["low", "medium", "high", "xhigh", "max"]

export interface LlmTurnRequest {
    system: string
    tools: LlmTool[]
    messages: LlmMessage[]
    maxTokens: number
    effort: LlmEffort
    signal?: AbortSignal
    /** Called with each piece of visible text as it is generated. */
    onText?: (delta: string) => void
    /** Called with each piece of the reasoning summary as it is generated, on providers that return one. */
    onThinking?: (delta: string) => void
}

export type LlmStopReason = "end_turn" | "tool_use" | "max_tokens" | "refusal"

export interface LlmUsage {
    /** Every input token of the request, the ones read from the prompt cache included. */
    inputTokens: number
    /** The part of `inputTokens` read from the prompt cache, billed at a fraction of the price. */
    cachedInputTokens: number
    outputTokens: number
}

export const NO_USAGE: LlmUsage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 }

export const addUsage = (total: LlmUsage, usage: LlmUsage): LlmUsage => ({
    inputTokens: total.inputTokens + usage.inputTokens,
    cachedInputTokens: total.cachedInputTokens + usage.cachedInputTokens,
    outputTokens: total.outputTokens + usage.outputTokens
})

export interface LlmTurnResult {
    text: string
    toolCalls: LlmToolCall[]
    stopReason: LlmStopReason
    usage: LlmUsage
    /** The summary of the reasoning of the turn, when the provider returns one (Claude only). */
    thinking?: string
    /** The assistant message to append to the conversation to continue it. */
    message: Extract<LlmMessage, { role: "assistant" }>
}

export interface LlmJsonRequest {
    system: string
    user: string
    schema: Record<string, unknown>
    maxTokens: number
    effort: LlmEffort
    signal?: AbortSignal
}

export interface LlmClient {
    readonly provider: LlmProvider
    /** One model turn: text, tool calls or both. Running the tools is up to the caller. */
    turn(request: LlmTurnRequest): Promise<LlmTurnResult>
    /** The parsed JSON answer, or null when the model refused or the answer was cut off. */
    json(request: LlmJsonRequest): Promise<unknown | null>
}

export const assistantMessage = (text: string, toolCalls: LlmToolCall[], native: unknown): Extract<LlmMessage, { role: "assistant" }> => ({
    role: "assistant",
    text,
    toolCalls,
    native
})

/** Tool arguments as an object, whatever the provider handed back. */
export const toInputObject = (value: unknown): Record<string, unknown> => {
    if (typeof value === "string") {
        try {
            return toInputObject(JSON.parse(value))
        } catch {
            return {}
        }
    }
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}
