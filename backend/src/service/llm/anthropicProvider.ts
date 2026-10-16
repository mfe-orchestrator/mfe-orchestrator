import Anthropic from "@anthropic-ai/sdk"
import { assistantMessage, LlmClient, LlmJsonRequest, LlmMessage, LlmProvider, LlmTool, LlmTurnRequest, LlmTurnResult, toInputObject } from "./types"

/** Server-side fallback when Claude declines: the API reroutes by refusal category. Anthropic API only, not Foundry. */
const FALLBACK_BETA = "server-side-fallback-2026-07-01"

type Block = Anthropic.Beta.BetaContentBlock

/** What both the Anthropic and the Foundry client offer: the Foundry one has no batches. */
export type ClaudeClient = { beta: { messages: Pick<Anthropic["beta"]["messages"], "stream" | "create"> } }

const toTools = (tools: LlmTool[]): Anthropic.Beta.BetaTool[] =>
    tools.map(tool => ({ name: tool.name, description: tool.description, input_schema: tool.inputSchema as Anthropic.Beta.BetaTool.InputSchema }))

const toMessages = (messages: LlmMessage[]): Anthropic.Beta.BetaMessageParam[] =>
    messages.map(message => {
        switch (message.role) {
            case "user":
                return { role: "user", content: message.text }
            case "assistant":
                // Native content first: it carries the thinking blocks, which must come back unchanged.
                return {
                    role: "assistant",
                    content: (message.native as Block[] | undefined) ?? [
                        ...(message.text ? [{ type: "text" as const, text: message.text }] : []),
                        ...message.toolCalls.map(call => ({ type: "tool_use" as const, id: call.id, name: call.name, input: call.input }))
                    ]
                }
            case "tool":
                // All results of a turn in one message, or Claude learns to stop calling tools in parallel.
                return {
                    role: "user",
                    content: message.results.map(result => ({ type: "tool_result" as const, tool_use_id: result.callId, content: result.content, is_error: result.isError || undefined }))
                }
        }
    })

/**
 * Claude, through the Anthropic API or deployed on Microsoft Foundry: the same SDK surface, a
 * different client. Foundry has no server-side fallback, so a declined request is reported as a
 * refusal there.
 */
export class AnthropicLlmClient implements LlmClient {
    constructor(
        readonly provider: LlmProvider.ANTHROPIC | LlmProvider.AZURE_FOUNDRY,
        private readonly client: ClaudeClient,
        private readonly model: string
    ) {}

    private get fallback() {
        return this.provider === LlmProvider.ANTHROPIC ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {}
    }

    async turn(request: LlmTurnRequest): Promise<LlmTurnResult> {
        const stream = this.client.beta.messages.stream(
            {
                model: this.model,
                max_tokens: request.maxTokens,
                output_config: { effort: request.effort },
                cache_control: { type: "ephemeral" },
                ...this.fallback,
                system: request.system,
                tools: toTools(request.tools),
                messages: toMessages(request.messages)
            },
            { signal: request.signal }
        )
        if (request.onText) stream.on("text", request.onText)
        const message = await stream.finalMessage()

        const text = message.content.flatMap(block => (block.type === "text" ? [block.text] : [])).join("")
        const toolCalls = message.content.flatMap(block => (block.type === "tool_use" ? [{ id: block.id, name: block.name, input: toInputObject(block.input) }] : []))
        const stopReason = message.stop_reason === "refusal" ? "refusal" : message.stop_reason === "max_tokens" ? "max_tokens" : toolCalls.length ? "tool_use" : "end_turn"
        return {
            text,
            toolCalls,
            stopReason,
            // Claude counts cache reads and writes apart from input_tokens: add them back, so that
            // inputTokens means the whole prompt on every provider.
            usage: {
                inputTokens: message.usage.input_tokens + (message.usage.cache_read_input_tokens ?? 0) + (message.usage.cache_creation_input_tokens ?? 0),
                cachedInputTokens: message.usage.cache_read_input_tokens ?? 0,
                outputTokens: message.usage.output_tokens
            },
            message: assistantMessage(text, toolCalls, message.content)
        }
    }

    async json(request: LlmJsonRequest): Promise<unknown | null> {
        const message = await this.client.beta.messages.create(
            {
                model: this.model,
                max_tokens: request.maxTokens,
                output_config: { effort: request.effort, format: { type: "json_schema", schema: request.schema } },
                ...this.fallback,
                system: request.system,
                messages: [{ role: "user", content: request.user }]
            },
            { signal: request.signal }
        )
        if (message.stop_reason === "refusal" || message.stop_reason === "max_tokens") return null
        const text = message.content.find((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")?.text
        if (!text) return null
        try {
            return JSON.parse(text)
        } catch {
            return null
        }
    }
}
