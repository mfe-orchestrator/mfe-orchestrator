import { randomUUID } from "node:crypto"
import { Content, FinishReason, GoogleGenAI, Part } from "@google/genai"
import { assistantMessage, LlmClient, LlmJsonRequest, LlmMessage, LlmProvider, LlmToolCall, LlmTurnRequest, LlmTurnResult, NO_USAGE, toInputObject } from "./types"

/** Finish reasons that mean Gemini declined to answer, not that it ran out of room. */
const BLOCKED: string[] = [FinishReason.SAFETY, FinishReason.PROHIBITED_CONTENT, FinishReason.BLOCKLIST, FinishReason.SPII, FinishReason.RECITATION]

const toContents = (messages: LlmMessage[]): Content[] =>
    messages.map(message => {
        switch (message.role) {
            case "user":
                return { role: "user", parts: [{ text: message.text }] }
            case "assistant":
                // Native parts first: function calls carry a thought signature Gemini wants back unchanged.
                return {
                    role: "model",
                    parts: (message.native as Part[] | undefined) ?? [
                        ...(message.text ? [{ text: message.text }] : []),
                        ...message.toolCalls.map(call => ({ functionCall: { id: call.id, name: call.name, args: call.input } }))
                    ]
                }
            case "tool":
                return {
                    role: "user",
                    parts: message.results.map(result => ({
                        functionResponse: { id: result.callId, name: result.name, response: result.isError ? { error: result.content } : { output: result.content } }
                    }))
                }
        }
    })

/** Gemini through the Gemini API. */
export class GeminiLlmClient implements LlmClient {
    readonly provider = LlmProvider.GEMINI

    constructor(
        private readonly client: GoogleGenAI,
        private readonly model: string
    ) {}

    async turn(request: LlmTurnRequest): Promise<LlmTurnResult> {
        const stream = await this.client.models.generateContentStream({
            model: this.model,
            contents: toContents(request.messages),
            config: {
                systemInstruction: request.system,
                maxOutputTokens: request.maxTokens,
                tools: request.tools.length
                    ? [{ functionDeclarations: request.tools.map(tool => ({ name: tool.name, description: tool.description, parametersJsonSchema: tool.inputSchema })) }]
                    : undefined,
                abortSignal: request.signal
            }
        })

        const parts: Part[] = []
        let finishReason: string | undefined
        let blocked = false
        let usage = NO_USAGE
        for await (const chunk of stream) {
            if (chunk.promptFeedback?.blockReason) blocked = true
            const candidate = chunk.candidates?.[0]
            for (const part of candidate?.content?.parts ?? []) {
                parts.push(part)
                if (part.text && !part.thought) request.onText?.(part.text)
            }
            if (candidate?.finishReason) finishReason = candidate.finishReason
            if (chunk.usageMetadata) {
                usage = {
                    inputTokens: chunk.usageMetadata.promptTokenCount ?? 0,
                    cachedInputTokens: chunk.usageMetadata.cachedContentTokenCount ?? 0,
                    outputTokens: (chunk.usageMetadata.candidatesTokenCount ?? 0) + (chunk.usageMetadata.thoughtsTokenCount ?? 0)
                }
            }
        }

        const text = parts.flatMap(part => (part.text && !part.thought ? [part.text] : [])).join("")
        // Gemini does not always number its calls. The id pairs a call with its result, and the
        // console tells the calls of a whole conversation apart by it: it must be unique, not an index.
        const native = parts.map(part => (part.functionCall && !part.functionCall.id ? { ...part, functionCall: { ...part.functionCall, id: `call_${randomUUID()}` } } : part))
        const toolCalls: LlmToolCall[] = native.flatMap(part =>
            part.functionCall?.name ? [{ id: part.functionCall.id as string, name: part.functionCall.name, input: toInputObject(part.functionCall.args) }] : []
        )
        const stopReason =
            blocked || (finishReason && BLOCKED.includes(finishReason)) ? "refusal" : finishReason === FinishReason.MAX_TOKENS ? "max_tokens" : toolCalls.length ? "tool_use" : "end_turn"
        return { text, toolCalls, stopReason, usage, message: assistantMessage(text, toolCalls, native) }
    }

    async json(request: LlmJsonRequest): Promise<unknown | null> {
        const response = await this.client.models.generateContent({
            model: this.model,
            contents: [{ role: "user", parts: [{ text: request.user }] }],
            config: {
                systemInstruction: request.system,
                maxOutputTokens: request.maxTokens,
                responseMimeType: "application/json",
                responseJsonSchema: request.schema,
                abortSignal: request.signal
            }
        })
        const finishReason = response.candidates?.[0]?.finishReason
        if (response.promptFeedback?.blockReason || (finishReason && (BLOCKED.includes(finishReason) || finishReason === FinishReason.MAX_TOKENS))) return null
        try {
            return response.text ? JSON.parse(response.text) : null
        } catch {
            return null
        }
    }
}
