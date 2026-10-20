import type OpenAI from "openai"
import { toResponseInputItems } from "openai/lib/responses/ResponseInputItems"
import type { FunctionTool, Response, ResponseInputItem, ResponseOutputItem } from "openai/resources/responses/responses"
import { assistantMessage, LlmClient, LlmEffort, LlmJsonRequest, LlmMessage, LlmProvider, LlmStopReason, LlmTool, LlmTurnRequest, LlmTurnResult, toInputObject } from "./types"

/** Deployments differ in the levels they accept: past `high` is sent as `high`, which every reasoning model takes. */
const toReasoningEffort = (effort: LlmEffort): "low" | "medium" | "high" => (effort === "xhigh" || effort === "max" ? "high" : effort)

const toTools = (tools: LlmTool[]): FunctionTool[] => tools.map(tool => ({ type: "function", name: tool.name, description: tool.description, parameters: tool.inputSchema, strict: false }))

/**
 * The output items that go back as input on the next turn: text, tool calls and the reasoning.
 * Reasoning without its encrypted content (a model that reasons by default, not configured as a
 * reasoning deployment) cannot go back: with `store: false` Azure does not know its id.
 */
const isReplayable = (item: ResponseOutputItem): boolean => item.type === "message" || item.type === "function_call" || (item.type === "reasoning" && Boolean(item.encrypted_content))

const toInput = (messages: LlmMessage[]): ResponseInputItem[] =>
    messages.flatMap((message): ResponseInputItem[] => {
        switch (message.role) {
            case "user":
                return [{ role: "user", content: message.text }]
            case "assistant":
                return (
                    (message.native as ResponseInputItem[] | undefined) ?? [
                        ...(message.text ? [{ role: "assistant" as const, content: message.text }] : []),
                        ...message.toolCalls.map(call => ({ type: "function_call" as const, call_id: call.id, name: call.name, arguments: JSON.stringify(call.input) }))
                    ]
                )
            case "tool":
                return message.results.map(result => ({ type: "function_call_output" as const, call_id: result.callId, output: result.isError ? `Error: ${result.content}` : result.content }))
        }
    })

const outputText = (response: Response) =>
    response.output
        .flatMap(item => (item.type === "message" ? item.content : []))
        .flatMap(part => (part.type === "output_text" ? [part.text] : []))
        .join("")

const isRefused = (response: Response) =>
    response.incomplete_details?.reason === "content_filter" || response.output.some(item => item.type === "message" && item.content.some(part => part.type === "refusal"))

/**
 * A failed response does not make the stream throw: it ends with `status: "failed"` and no output,
 * which would otherwise read as a turn that simply ended.
 */
const stopReasonOf = (response: Response, hasToolCalls: boolean): LlmStopReason => {
    if (isRefused(response)) return "refusal"
    if (response.incomplete_details?.reason === "max_output_tokens") return "max_tokens"
    if (response.status === "failed" || response.status === "incomplete") {
        throw new Error(`Azure OpenAI response ${response.status}: ${response.error?.message ?? response.incomplete_details?.reason ?? "no reason given"}`)
    }
    return hasToolCalls ? "tool_use" : "end_turn"
}

/**
 * GPT models deployed on Azure OpenAI, through the Responses API of the v1 endpoint. The deployment
 * is the model.
 *
 * Not Chat Completions: from GPT-5.6 on, it rejects function tools unless reasoning is off, and the
 * assistant and the code agent always send tools. Nothing is stored on Azure (`store: false`): the
 * whole conversation is sent every turn, as with the other providers, and the reasoning comes back
 * encrypted so it can be replayed. The effort is sent only to reasoning deployments: the others
 * reject it.
 */
export class AzureOpenAiLlmClient implements LlmClient {
    readonly provider = LlmProvider.AZURE_OPENAI

    constructor(
        private readonly client: OpenAI,
        private readonly deployment: string,
        private readonly reasoning: boolean
    ) {}

    private options(effort: LlmEffort) {
        return this.reasoning ? { reasoning: { effort: toReasoningEffort(effort) }, include: ["reasoning.encrypted_content" as const] } : {}
    }

    async turn(request: LlmTurnRequest): Promise<LlmTurnResult> {
        const stream = this.client.responses.stream(
            {
                model: this.deployment,
                instructions: request.system,
                input: toInput(request.messages),
                tools: request.tools.length ? toTools(request.tools) : undefined,
                max_output_tokens: request.maxTokens,
                store: false,
                ...this.options(request.effort)
            },
            { signal: request.signal }
        )
        if (request.onText) stream.on("response.output_text.delta", event => request.onText?.(event.delta))
        const response = await stream.finalResponse()

        const text = outputText(response)
        const toolCalls = response.output.flatMap(item => (item.type === "function_call" ? [{ id: item.call_id, name: item.name, input: toInputObject(item.arguments) }] : []))
        const stopReason = stopReasonOf(response, toolCalls.length > 0)
        // finalResponse() adds parsed_arguments and parsed to the items: the API rejects them as input.
        const native = toResponseInputItems(response.output.filter(isReplayable))
        return {
            text,
            toolCalls,
            stopReason,
            usage: {
                inputTokens: response.usage?.input_tokens ?? 0,
                cachedInputTokens: response.usage?.input_tokens_details?.cached_tokens ?? 0,
                outputTokens: response.usage?.output_tokens ?? 0
            },
            message: assistantMessage(text, toolCalls, native)
        }
    }

    async json(request: LlmJsonRequest): Promise<unknown | null> {
        const response = await this.client.responses.create(
            {
                model: this.deployment,
                instructions: request.system,
                input: request.user,
                max_output_tokens: request.maxTokens,
                store: false,
                text: { format: { type: "json_schema", name: "answer", schema: request.schema, strict: true } },
                ...(this.reasoning ? { reasoning: { effort: toReasoningEffort(request.effort) } } : {})
            },
            { signal: request.signal }
        )
        const text = outputText(response)
        if (response.status !== "completed" || isRefused(response) || !text) return null
        try {
            return JSON.parse(text)
        } catch {
            return null
        }
    }
}
