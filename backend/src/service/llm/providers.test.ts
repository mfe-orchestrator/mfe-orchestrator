import type { GoogleGenAI } from "@google/genai"
import type OpenAI from "openai"
import { describe, expect, it, vi } from "vitest"
import { AnthropicLlmClient, ClaudeClient } from "./anthropicProvider"
import { AzureOpenAiLlmClient } from "./azureOpenAiProvider"
import { GeminiLlmClient } from "./geminiProvider"
import { isLlmEnabled, isRateLimitError, LlmMessage, LlmProvider, LlmTurnRequest, resolveLlmProvider } from "./index"

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
            "AI_PROVIDER=azure-openai needs AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT"
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

describe("isRateLimitError", () => {
    it("Given a 429, or a mid-stream error with no status and a rate-limit code or message, then it is a rate limit; any other error is not", () => {
        expect(isRateLimitError({ status: 429 })).toBe(true)
        expect(isRateLimitError({ status: undefined, code: "no_capacity" })).toBe(true)
        expect(isRateLimitError({ code: "rate_limit_exceeded" })).toBe(true)
        expect(isRateLimitError(new Error("Your requests to gpt-6.1-sol for gpt-6.1-sol in northcentralus have exceeded token rate limit."))).toBe(true)
        expect(isRateLimitError({ status: 500, code: "server_error" })).toBe(false)
        expect(isRateLimitError(new Error("boom"))).toBe(false)
        expect(isRateLimitError(null)).toBe(false)
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

    it("Given a prompt partly served from the cache, then the input tokens count the whole prompt and the cached part is reported apart", async () => {
        const stream = vi.fn((_body: unknown) => ({
            on: vi.fn(),
            finalMessage: async () => ({
                content: [{ type: "text", text: "ok" }],
                stop_reason: "end_turn",
                usage: { input_tokens: 20, cache_read_input_tokens: 1_000, cache_creation_input_tokens: 300, output_tokens: 9 }
            })
        }))
        const client = { beta: { messages: { stream, create: vi.fn() } } } as unknown as ClaudeClient

        const result = await new AnthropicLlmClient(LlmProvider.ANTHROPIC, client, "claude-opus-5-5").turn(request([{ role: "user", text: "hi" }]))

        expect(result.usage).toEqual({ inputTokens: 1_320, cachedInputTokens: 1_000, outputTokens: 9 })
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
        const id = first.toolCalls[0].id
        expect(id).toMatch(/^call_[0-9a-f-]{36}$/)
        expect(first.toolCalls).toEqual([{ id, name: "read_file", input: { path: "a.ts" } }])
        const contents = (generateContentStream.mock.calls[1] as unknown as [{ contents: { role: string; parts: Record<string, unknown>[] }[] }])[0].contents
        expect(contents[1].role).toBe("model")
        expect(contents[1].parts[2]).toEqual({ functionCall: { id, name: "read_file", args: { path: "a.ts" } }, thoughtSignature: "sig-1" })
        expect(contents[2]).toEqual({ role: "user", parts: [{ functionResponse: { id, name: "read_file", response: { output: "x" } } }] })
    })

    it("Given unnumbered calls in two rounds and a numbered one, then every unnumbered call gets its own id and Gemini's id is kept", async () => {
        const round = () => [
            { candidates: [{ content: { parts: [{ functionCall: { name: "read_file", args: {} } }, { functionCall: { id: "g-7", name: "read_file", args: {} } }] }, finishReason: "STOP" }] }
        ]
        const first = await new GeminiLlmClient(fakeGemini(round()).client, "gemini-x").turn(request([{ role: "user", text: "hi" }]))
        const second = await new GeminiLlmClient(fakeGemini(round()).client, "gemini-x").turn(request([{ role: "user", text: "hi" }]))

        expect(first.toolCalls[1].id).toBe("g-7")
        expect(first.toolCalls[0].id).not.toBe(second.toolCalls[0].id)
        expect((first.message.native as { functionCall?: { id: string } }[])[0].functionCall?.id).toBe(first.toolCalls[0].id)
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
    const fakeAzure = (response: Record<string, unknown>) => {
        const stream = vi.fn((_body: unknown) => ({
            on: vi.fn(),
            finalResponse: async () => ({ status: "completed", incomplete_details: null, usage: { input_tokens: 5, output_tokens: 6 }, ...response })
        }))
        const create = vi.fn(async (_body: unknown) => ({ status: "completed", incomplete_details: null, ...response }))
        return { client: { responses: { stream, create } } as unknown as OpenAI, stream, create }
    }
    const message = (text: string) => ({ type: "message", id: "msg_1", role: "assistant", status: "completed", content: [{ type: "output_text", text, annotations: [] }] })
    const reasoningItem = { type: "reasoning", id: "rs_1", summary: [], encrypted_content: "enc" }
    const toolCallItem = { type: "function_call", id: "fc_1", call_id: "call_9", name: "read_file", arguments: '{"path":"a.ts"}', status: "completed" }
    /** What finalResponse() hands back: the SDK adds parsed values the API rejects as input. */
    const parsedBySdk = (items: Record<string, unknown>[]) =>
        items.map(item =>
            item.type === "function_call"
                ? { ...item, parsed_arguments: null }
                : item.type === "message"
                  ? { ...item, content: (item.content as Record<string, unknown>[]).map(part => ({ ...part, parsed: null })) }
                  : item
        )

    it("Given a tool call, when the conversation goes on, then the output items are replayed without the SDK's parsed values and each result becomes a function_call_output", async () => {
        const { client, stream } = fakeAzure({ output: parsedBySdk([reasoningItem, { type: "reasoning", id: "rs_2", summary: [] }, message("Let me look."), toolCallItem]) })
        const llm = new AzureOpenAiLlmClient(client, "gpt-deployment", false)

        const first = await llm.turn(request([{ role: "user", text: "hi" }]))
        await llm.turn(request([{ role: "user", text: "hi" }, first.message, { role: "tool", results: [{ callId: "call_9", name: "read_file", content: "boom", isError: true }] }]))

        expect(first).toMatchObject({
            text: "Let me look.",
            stopReason: "tool_use",
            toolCalls: [{ id: "call_9", name: "read_file", input: { path: "a.ts" } }],
            usage: { inputTokens: 5, outputTokens: 6 }
        })
        const body = (stream.mock.calls[1] as unknown as [{ model: string; instructions: string; store: boolean; tools: Record<string, unknown>[]; input: Record<string, unknown>[] }])[0]
        expect(body).toMatchObject({ model: "gpt-deployment", instructions: "You edit code.", store: false })
        expect(body.tools[0]).toMatchObject({ type: "function", name: "read_file", parameters: tool.inputSchema })
        expect(body.input).toEqual([{ role: "user", content: "hi" }, reasoningItem, message("Let me look."), toolCallItem, { type: "function_call_output", call_id: "call_9", output: "Error: boom" }])
    })

    it("Given a reasoning deployment, then the effort is sent and the reasoning comes back encrypted; otherwise neither, since other models reject it", async () => {
        const reasoning = fakeAzure({ output: [message("ok")] })
        const plain = fakeAzure({ output: [message("ok")] })

        await new AzureOpenAiLlmClient(reasoning.client, "gpt-6", true).turn(request([{ role: "user", text: "hi" }]))
        await new AzureOpenAiLlmClient(plain.client, "gpt-4-1", false).turn(request([{ role: "user", text: "hi" }]))

        expect(reasoning.stream.mock.calls[0][0]).toMatchObject({ reasoning: { effort: "high" }, include: ["reasoning.encrypted_content"] })
        expect(plain.stream.mock.calls[0][0]).not.toHaveProperty("reasoning")
        expect(plain.stream.mock.calls[0][0]).not.toHaveProperty("include")
    })

    it.each([
        [{ status: "incomplete", incomplete_details: { reason: "content_filter" }, output: [] }, "refusal"],
        [{ output: [{ ...message(""), content: [{ type: "refusal", refusal: "no" }] }] }, "refusal"],
        [{ status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [message("half")] }, "max_tokens"],
        [{ output: [message("done")] }, "end_turn"]
    ])("Given the response %j, then the stop reason is %s", async (response, stopReason) => {
        const { client } = fakeAzure(response)

        expect((await new AzureOpenAiLlmClient(client, "gpt", false).turn(request([{ role: "user", text: "hi" }]))).stopReason).toBe(stopReason)
    })

    it("Given a failed response, then the turn throws instead of ending as if the model had finished", async () => {
        const { client } = fakeAzure({ status: "failed", error: { code: "server_error", message: "boom" }, output: [] })

        await expect(new AzureOpenAiLlmClient(client, "gpt", false).turn(request([{ role: "user", text: "hi" }]))).rejects.toThrow("Azure OpenAI response failed: boom")
    })

    it("Given a JSON request, then the schema is enforced and only a completed answer is parsed", async () => {
        const answered = fakeAzure({ output: [message('{"name":"x"}')] })
        const cut = fakeAzure({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [message('{"na')] })
        const json = { system: "s", user: "u", schema: { type: "object" }, maxTokens: 100, effort: "low" as const }

        expect(await new AzureOpenAiLlmClient(answered.client, "gpt", true).json(json)).toEqual({ name: "x" })
        expect(await new AzureOpenAiLlmClient(cut.client, "gpt", true).json(json)).toBeNull()
        expect(answered.create.mock.calls[0][0]).toMatchObject({
            store: false,
            reasoning: { effort: "low" },
            text: { format: { type: "json_schema", name: "answer", schema: { type: "object" }, strict: true } }
        })
    })
})
