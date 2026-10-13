import type { GoogleGenAI } from "@google/genai"
import type { AzureOpenAI } from "openai"
import { describe, expect, it, vi } from "vitest"
import { AnthropicLlmClient, ClaudeClient } from "./anthropicProvider"
import { AzureOpenAiLlmClient } from "./azureOpenAiProvider"
import { GeminiLlmClient } from "./geminiProvider"
import { isLlmEnabled, LlmMessage, LlmProvider, LlmTurnRequest, resolveLlmProvider } from "./index"

const tool = { name: "read_file", description: "Reads a file", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } }

const request = (messages: LlmMessage[], onText?: (delta: string) => void): LlmTurnRequest => ({
    system: "You edit code.",
    tools: [tool],
    messages,
    maxTokens: 1_000,
    effort: "high",
    onText
})

describe("resolveLlmProvider", () => {
    it("Given only an Anthropic key, then Claude is used, as before the provider could be chosen", () => {
        expect(resolveLlmProvider({ ANTHROPIC_API_KEY: "sk" })).toBe(LlmProvider.ANTHROPIC)
    })

    it("Given nothing, then AI is off", () => {
        expect(resolveLlmProvider({})).toBeUndefined()
        expect(isLlmEnabled({})).toBe(false)
    })

    it("Given a provider without its variables, then it names what is missing", () => {
        expect(() => resolveLlmProvider({ AI_PROVIDER: "azure-openai", AZURE_OPENAI_ENDPOINT: "https://x.openai.azure.com" })).toThrow(
            "AI_PROVIDER=azure-openai needs AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT, AZURE_OPENAI_API_VERSION"
        )
        expect(isLlmEnabled({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "k" })).toBe(false)
    })

    it("Given an unknown provider, then it is refused", () => {
        expect(() => resolveLlmProvider({ AI_PROVIDER: "openai" })).toThrow(/not one of/)
    })

    it("Given a complete Gemini configuration with an Anthropic key around, then the named provider wins", () => {
        expect(resolveLlmProvider({ AI_PROVIDER: "Gemini", GEMINI_API_KEY: "k", GEMINI_MODEL: "gemini-x", ANTHROPIC_API_KEY: "sk" })).toBe(LlmProvider.GEMINI)
    })
})

describe("AnthropicLlmClient", () => {
    const fakeClaude = (content: unknown[], stop_reason = "tool_use") => {
        const stream = vi.fn((_body: unknown) => ({ on: vi.fn(), finalMessage: async () => ({ content, stop_reason, usage: { input_tokens: 3, output_tokens: 4 } }) }))
        return { client: { beta: { messages: { stream, create: vi.fn() } } } as unknown as ClaudeClient, stream }
    }

    it("Given the Anthropic API, then the server-side fallback is asked for; on Foundry, where it does not exist, it is not", async () => {
        const direct = fakeClaude([{ type: "text", text: "ok" }], "end_turn")
        const foundry = fakeClaude([{ type: "text", text: "ok" }], "end_turn")

        await new AnthropicLlmClient(LlmProvider.ANTHROPIC, direct.client, "claude-opus-5-5").turn(request([{ role: "user", text: "hi" }]))
        await new AnthropicLlmClient(LlmProvider.AZURE_FOUNDRY, foundry.client, "my-claude-deployment").turn(request([{ role: "user", text: "hi" }]))

        expect(direct.stream.mock.calls[0][0]).toMatchObject({ fallbacks: "default", betas: ["server-side-fallback-2026-07-01"] })
        expect(foundry.stream.mock.calls[0][0]).toMatchObject({ model: "my-claude-deployment" })
        expect(foundry.stream.mock.calls[0][0]).not.toHaveProperty("fallbacks")
    })

    it("Given a turn with thinking and a tool call, when the conversation goes on, then the blocks go back unchanged and the result pairs with the call", async () => {
        const content = [
            { type: "thinking", thinking: "", signature: "sig" },
            { type: "tool_use", id: "toolu_1", name: "read_file", input: { path: "a.ts" } }
        ]
        const { client, stream } = fakeClaude(content)
        const llm = new AnthropicLlmClient(LlmProvider.ANTHROPIC, client, "claude-opus-5-5")

        const first = await llm.turn(request([{ role: "user", text: "hi" }]))
        await llm.turn(request([{ role: "user", text: "hi" }, first.message, { role: "tool", results: [{ callId: "toolu_1", name: "read_file", content: "x" }] }]))

        expect(first.toolCalls).toEqual([{ id: "toolu_1", name: "read_file", input: { path: "a.ts" } }])
        const sent = (stream.mock.calls[1] as unknown as [{ messages: unknown[] }])[0].messages
        expect(sent[1]).toEqual({ role: "assistant", content })
        expect(sent[2]).toEqual({ role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "x", is_error: undefined }] })
    })
})

describe("GeminiLlmClient", () => {
    const fakeGemini = (chunks: unknown[]) => {
        const generateContentStream = vi.fn(async () =>
            (async function* () {
                yield* chunks
            })()
        )
        return { client: { models: { generateContentStream, generateContent: vi.fn() } } as unknown as GoogleGenAI, generateContentStream }
    }

    it("Given streamed text, thoughts and an unnumbered call with a thought signature, then text streams, thoughts stay hidden and the call gets an id kept in the history", async () => {
        const { client, generateContentStream } = fakeGemini([
            { candidates: [{ content: { parts: [{ text: "planning", thought: true }, { text: "Let me look." }] } }] },
            {
                candidates: [{ content: { parts: [{ functionCall: { name: "read_file", args: { path: "a.ts" } }, thoughtSignature: "sig-1" }] }, finishReason: "STOP" }],
                usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 2, thoughtsTokenCount: 3 }
            }
        ])
        const llm = new GeminiLlmClient(client, "gemini-x")
        const streamed: string[] = []

        const first = await llm.turn(request([{ role: "user", text: "hi" }], delta => streamed.push(delta)))
        await llm.turn(request([{ role: "user", text: "hi" }, first.message, { role: "tool", results: [{ callId: first.toolCalls[0].id, name: "read_file", content: "x" }] }]))

        expect(streamed).toEqual(["Let me look."])
        expect(first).toMatchObject({ text: "Let me look.", stopReason: "tool_use", usage: { inputTokens: 7, outputTokens: 5 } })
        expect(first.toolCalls).toEqual([{ id: "call_2", name: "read_file", input: { path: "a.ts" } }])
        const contents = (generateContentStream.mock.calls[1] as unknown as [{ contents: { role: string; parts: Record<string, unknown>[] }[] }])[0].contents
        expect(contents[1].role).toBe("model")
        expect(contents[1].parts[2]).toEqual({ functionCall: { id: "call_2", name: "read_file", args: { path: "a.ts" } }, thoughtSignature: "sig-1" })
        expect(contents[2]).toEqual({ role: "user", parts: [{ functionResponse: { id: "call_2", name: "read_file", response: { output: "x" } } }] })
    })

    it.each([
        ["SAFETY", "refusal"],
        ["PROHIBITED_CONTENT", "refusal"],
        ["MAX_TOKENS", "max_tokens"],
        ["STOP", "end_turn"]
    ])("Given finish reason %s, then the stop reason is %s", async (finishReason, stopReason) => {
        const { client } = fakeGemini([{ candidates: [{ content: { parts: [{ text: "x" }] }, finishReason }] }])

        expect((await new GeminiLlmClient(client, "gemini-x").turn(request([{ role: "user", text: "hi" }]))).stopReason).toBe(stopReason)
    })
})

describe("AzureOpenAiLlmClient", () => {
    const fakeAzure = (choice: Record<string, unknown>) => {
        const stream = vi.fn((_body: unknown) => ({ on: vi.fn(), finalChatCompletion: async () => ({ choices: [choice], usage: { prompt_tokens: 5, completion_tokens: 6 } }) }))
        return { client: { chat: { completions: { stream, create: vi.fn() } } } as unknown as AzureOpenAI, stream }
    }
    const toolCallChoice = {
        finish_reason: "tool_calls",
        message: { role: "assistant", content: null, tool_calls: [{ id: "call_9", type: "function", function: { name: "read_file", arguments: '{"path":"a.ts"}' } }] }
    }

    it("Given a tool call, when the conversation goes on, then the arguments are parsed and each result becomes a tool message", async () => {
        const { client, stream } = fakeAzure(toolCallChoice)
        const llm = new AzureOpenAiLlmClient(client, "gpt-deployment", false)

        const first = await llm.turn(request([{ role: "user", text: "hi" }]))
        await llm.turn(request([{ role: "user", text: "hi" }, first.message, { role: "tool", results: [{ callId: "call_9", name: "read_file", content: "boom", isError: true }] }]))

        expect(first).toMatchObject({ stopReason: "tool_use", toolCalls: [{ id: "call_9", name: "read_file", input: { path: "a.ts" } }], usage: { inputTokens: 5, outputTokens: 6 } })
        const body = (stream.mock.calls[1] as unknown as [{ model: string; messages: Record<string, unknown>[] }])[0]
        expect(body.model).toBe("gpt-deployment")
        expect(body.messages[0]).toEqual({ role: "system", content: "You edit code." })
        expect(body.messages[2]).toMatchObject({ role: "assistant", tool_calls: toolCallChoice.message.tool_calls })
        expect(body.messages[3]).toEqual({ role: "tool", tool_call_id: "call_9", content: "Error: boom" })
    })

    it("Given a reasoning deployment, then the effort is sent; otherwise it is not, since other models reject it", async () => {
        const reasoning = fakeAzure({ finish_reason: "stop", message: { role: "assistant", content: "ok" } })
        const plain = fakeAzure({ finish_reason: "stop", message: { role: "assistant", content: "ok" } })

        await new AzureOpenAiLlmClient(reasoning.client, "gpt-5", true).turn(request([{ role: "user", text: "hi" }]))
        await new AzureOpenAiLlmClient(plain.client, "gpt-4-1", false).turn(request([{ role: "user", text: "hi" }]))

        expect(reasoning.stream.mock.calls[0][0]).toMatchObject({ reasoning_effort: "high" })
        expect(plain.stream.mock.calls[0][0]).not.toHaveProperty("reasoning_effort")
    })

    it("Given the content filter stops the answer, then it is a refusal", async () => {
        const { client } = fakeAzure({ finish_reason: "content_filter", message: { role: "assistant", content: "" } })

        expect((await new AzureOpenAiLlmClient(client, "gpt", false).turn(request([{ role: "user", text: "hi" }]))).stopReason).toBe("refusal")
    })
})
