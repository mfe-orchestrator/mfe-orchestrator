import { AzureOpenAI } from "openai"
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions"
import { assistantMessage, LlmClient, LlmJsonRequest, LlmMessage, LlmProvider, LlmTool, LlmTurnRequest, LlmTurnResult, toInputObject } from "./types"

const toTools = (tools: LlmTool[]): ChatCompletionTool[] => tools.map(tool => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } }))

const toMessages = (system: string, messages: LlmMessage[]): ChatCompletionMessageParam[] => [
    { role: "system", content: system },
    ...messages.flatMap((message): ChatCompletionMessageParam[] => {
        switch (message.role) {
            case "user":
                return [{ role: "user", content: message.text }]
            case "assistant":
                return [
                    (message.native as ChatCompletionMessageParam | undefined) ?? {
                        role: "assistant",
                        content: message.text || null,
                        tool_calls: message.toolCalls.length
                            ? message.toolCalls.map(call => ({ id: call.id, type: "function" as const, function: { name: call.name, arguments: JSON.stringify(call.input) } }))
                            : undefined
                    }
                ]
            case "tool":
                return message.results.map(result => ({ role: "tool" as const, tool_call_id: result.callId, content: result.isError ? `Error: ${result.content}` : result.content }))
        }
    })
]

/**
 * GPT models deployed on Azure OpenAI, through Chat Completions. The deployment is the model.
 * The effort is sent as `reasoning_effort` only to reasoning deployments: the others reject it.
 */
export class AzureOpenAiLlmClient implements LlmClient {
    readonly provider = LlmProvider.AZURE_OPENAI

    constructor(
        private readonly client: AzureOpenAI,
        private readonly deployment: string,
        private readonly reasoning: boolean
    ) {}

    private effort(effort: LlmTurnRequest["effort"]) {
        return this.reasoning ? { reasoning_effort: effort } : {}
    }

    async turn(request: LlmTurnRequest): Promise<LlmTurnResult> {
        const stream = this.client.chat.completions.stream(
            {
                model: this.deployment,
                max_completion_tokens: request.maxTokens,
                ...this.effort(request.effort),
                messages: toMessages(request.system, request.messages),
                tools: request.tools.length ? toTools(request.tools) : undefined
            },
            { signal: request.signal }
        )
        if (request.onText) stream.on("content", delta => request.onText?.(delta))
        const completion = await stream.finalChatCompletion()
        const choice = completion.choices[0]
        const message = choice?.message

        const text = message?.content ?? ""
        const toolCalls = (message?.tool_calls ?? []).flatMap(call => (call.type === "function" ? [{ id: call.id, name: call.function.name, input: toInputObject(call.function.arguments) }] : []))
        const stopReason = choice?.finish_reason === "content_filter" || message?.refusal ? "refusal" : choice?.finish_reason === "length" ? "max_tokens" : toolCalls.length ? "tool_use" : "end_turn"
        const native: ChatCompletionMessageParam = {
            role: "assistant",
            content: message?.content ?? null,
            tool_calls: message?.tool_calls?.length ? message.tool_calls : undefined
        }
        return {
            text,
            toolCalls,
            stopReason,
            usage: { inputTokens: completion.usage?.prompt_tokens ?? 0, outputTokens: completion.usage?.completion_tokens ?? 0 },
            message: assistantMessage(text, toolCalls, native)
        }
    }

    async json(request: LlmJsonRequest): Promise<unknown | null> {
        const completion = await this.client.chat.completions.create(
            {
                model: this.deployment,
                max_completion_tokens: request.maxTokens,
                ...this.effort(request.effort),
                messages: [
                    { role: "system", content: request.system },
                    { role: "user", content: request.user }
                ],
                response_format: { type: "json_schema", json_schema: { name: "answer", schema: request.schema, strict: true } }
            },
            { signal: request.signal }
        )
        const choice = completion.choices[0]
        if (!choice || choice.finish_reason !== "stop" || choice.message.refusal || !choice.message.content) return null
        try {
            return JSON.parse(choice.message.content)
        } catch {
            return null
        }
    }
}
