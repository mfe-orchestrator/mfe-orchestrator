import { AnthropicBedrockMantle } from "@anthropic-ai/bedrock-sdk"
import type { GoogleGenAI } from "@google/genai"
import type OpenAI from "openai"
import { describe, expect, it, vi } from "vitest"
import { AnthropicLlmClient, ClaudeClient } from "./anthropicProvider"
import { AzureOpenAiLlmClient } from "./azureOpenAiProvider"
import { GeminiLlmClient } from "./geminiProvider"
import {
    AiModelSettings,
    aiProviderError,
    createLlmClient,
    DEFAULT_CLAUDE_MODEL,
    effortsFor,
    forgetLlmClient,
    getLlmClient,
    isRateLimitError,
    LlmMessage,
    LlmProvider,
    LlmTurnRequest,
    resolveEffort,
    resolveLlmProvider,
    SYSTEM_AI_MODEL_ID,
    systemAiModel
} from "./index"

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

    it("Given nothing, then there is no system AI", () => {
        expect(resolveLlmProvider({})).toBeUndefined()
        expect(systemAiModel({})).toBeUndefined()
    })

    it("Given a provider without its variables, then it names what is missing", () => {
        expect(() => resolveLlmProvider({ AI_PROVIDER: "azure-openai", AZURE_OPENAI_ENDPOINT: "https://x.openai.azure.com" })).toThrow(
            "AI_PROVIDER=azure-openai needs AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT"
        )
        expect(() => resolveLlmProvider({ AI_PROVIDER: "aws-bedrock", AWS_BEDROCK_REGION: "eu-west-1" })).toThrow(
            "AI_PROVIDER=aws-bedrock needs AWS_BEDROCK_ACCESS_KEY_ID, AWS_BEDROCK_SECRET_ACCESS_KEY, AWS_BEDROCK_MODEL"
        )
    })

    it("Given an unknown provider, then it is refused", () => {
        expect(() => resolveLlmProvider({ AI_PROVIDER: "openai" })).toThrow(/not one of/)
    })

    it("Given a complete Gemini configuration with an Anthropic key around, then the named provider wins", () => {
        expect(resolveLlmProvider({ AI_PROVIDER: "Gemini", GEMINI_API_KEY: "k", GEMINI_MODEL: "gemini-x", ANTHROPIC_API_KEY: "sk" })).toBe(LlmProvider.GEMINI)
    })
})

describe("systemAiModel", () => {
    it("Given only an Anthropic key, then the system AI is Claude on the default model, under the fixed id", () => {
        expect(systemAiModel({ ANTHROPIC_API_KEY: "sk", AI_MAX_EFFORT: "high" })).toEqual({
            id: SYSTEM_AI_MODEL_ID,
            name: "System",
            provider: LlmProvider.ANTHROPIC,
            model: DEFAULT_CLAUDE_MODEL,
            config: { apiKey: "sk" },
            maxEffort: "high"
        })
    })

    it("Given each provider's variables, then the model and the config are read from them", () => {
        expect(systemAiModel({ AI_PROVIDER: "azure-foundry", AZURE_FOUNDRY_RESOURCE: "res", AZURE_FOUNDRY_API_KEY: "k", AZURE_FOUNDRY_MODEL: "my-claude" })).toMatchObject({
            model: "my-claude",
            config: { resource: "res", apiKey: "k" }
        })
        expect(
            systemAiModel({ AI_PROVIDER: "azure-openai", AZURE_OPENAI_ENDPOINT: "https://x.openai.azure.com", AZURE_OPENAI_API_KEY: "k", AZURE_OPENAI_DEPLOYMENT: "gpt", AZURE_OPENAI_REASONING: true })
        ).toMatchObject({ model: "gpt", config: { endpoint: "https://x.openai.azure.com", apiKey: "k", reasoning: true } })
        expect(
            systemAiModel({
                AI_PROVIDER: "aws-bedrock",
                AWS_BEDROCK_REGION: "eu-west-1",
                AWS_BEDROCK_ACCESS_KEY_ID: "AKIA",
                AWS_BEDROCK_SECRET_ACCESS_KEY: "secret",
                AWS_BEDROCK_MODEL: "anthropic.claude-opus-5-5"
            })
        ).toMatchObject({ provider: LlmProvider.AWS_BEDROCK, model: "anthropic.claude-opus-5-5", config: { region: "eu-west-1", accessKeyId: "AKIA", secretAccessKey: "secret" } })
    })
})

/** An AI as the model layer takes it. */
const settings = (overrides: Partial<AiModelSettings>): AiModelSettings => ({
    id: "ai-1",
    name: "AI",
    provider: LlmProvider.ANTHROPIC,
    model: "claude-opus-5-5",
    config: { apiKey: "sk" },
    ...overrides
})

describe("effortsFor", () => {
    it("Given Claude, then every level is offered, on the Anthropic API as on Foundry and on Bedrock", () => {
        for (const provider of [LlmProvider.ANTHROPIC, LlmProvider.AZURE_FOUNDRY, LlmProvider.AWS_BEDROCK]) {
            expect(effortsFor(settings({ provider }))).toEqual(["low", "medium", "high", "xhigh", "max"])
        }
    })

    it("Given an Azure OpenAI reasoning deployment, then up to high; a deployment that does not reason takes none", () => {
        expect(effortsFor(settings({ provider: LlmProvider.AZURE_OPENAI, config: { reasoning: true } }))).toEqual(["low", "medium", "high"])
        expect(effortsFor(settings({ provider: LlmProvider.AZURE_OPENAI, config: {} }))).toEqual([])
    })

    it("Given Gemini, then no level is offered", () => {
        expect(effortsFor(settings({ provider: LlmProvider.GEMINI }))).toEqual([])
    })

    it("Given a maxEffort, then the levels above it are not offered", () => {
        const azure = settings({ provider: LlmProvider.AZURE_OPENAI, config: { reasoning: true } })

        expect(effortsFor(settings({ maxEffort: "high" }))).toEqual(["low", "medium", "high"])
        expect(effortsFor(settings({ provider: LlmProvider.AWS_BEDROCK, maxEffort: "low" }))).toEqual(["low"])
        expect(effortsFor({ ...azure, maxEffort: "medium" })).toEqual(["low", "medium"])
        expect(effortsFor({ ...azure, maxEffort: "max" })).toEqual(["low", "medium", "high"])
    })

    it("Given the system AI capped by AI_MAX_EFFORT, then the cap applies to it as a maxEffort", () => {
        expect(effortsFor(systemAiModel({ ANTHROPIC_API_KEY: "sk", AI_MAX_EFFORT: "medium" })!)).toEqual(["low", "medium"])
    })
})

describe("resolveEffort", () => {
    it("Given no cap, then the effort asked for is served, else the default", () => {
        expect(resolveEffort({}, "max", "medium")).toBe("max")
        expect(resolveEffort({}, undefined, "medium")).toBe("medium")
    })

    it("Given a cap, then an effort above it, asked for or by default, is served at the cap and one below is kept", () => {
        expect(resolveEffort({ maxEffort: "high" }, "max", "medium")).toBe("high")
        expect(resolveEffort({ maxEffort: "medium" }, undefined, "high")).toBe("medium")
        expect(resolveEffort({ maxEffort: "high" }, "low", "high")).toBe("low")
    })
})

describe("createLlmClient", () => {
    it("Given an AWS Bedrock AI, then Claude is served through Bedrock's Messages API with the AI's keys and model, without the server-side fallback", async () => {
        const client = createLlmClient(
            settings({ provider: LlmProvider.AWS_BEDROCK, model: "anthropic.claude-opus-5-5", config: { region: "eu-west-1", accessKeyId: "AKIA", secretAccessKey: "secret" } })
        )

        expect(client).toBeInstanceOf(AnthropicLlmClient)
        expect(client.provider).toBe(LlmProvider.AWS_BEDROCK)
        const bedrock = (client as unknown as { client: AnthropicBedrockMantle }).client
        expect(bedrock).toBeInstanceOf(AnthropicBedrockMantle)
        expect(bedrock).toMatchObject({ awsRegion: "eu-west-1", awsAccessKey: "AKIA" })
        expect(bedrock.baseURL).toContain("bedrock-mantle.eu-west-1")
        const stream = vi
            .spyOn(bedrock.beta.messages, "stream")
            .mockReturnValue({ on: vi.fn(), finalMessage: async () => ({ content: [], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }) } as never)

        await client.turn(request([{ role: "user", text: "hi" }]))

        expect(stream.mock.calls[0][0]).toMatchObject({ model: "anthropic.claude-opus-5-5", output_config: { effort: "high" }, thinking: { type: "adaptive", display: "summarized" } })
        expect(stream.mock.calls[0][0]).not.toHaveProperty("fallbacks")
    })

    /** Without its keys an SDK would read ANTHROPIC_API_KEY, AWS_ACCESS_KEY_ID... from the process: the installation's. */
    it("Given an organization's AI without its credentials, then no client is built; the system AI is the operator's and is not checked", () => {
        expect(() => createLlmClient(settings({ config: {} }))).toThrow("The AI ai-1 has no apiKey")
        expect(() => createLlmClient(settings({ provider: LlmProvider.AWS_BEDROCK, config: { region: "eu-west-1" } }))).toThrow("has no accessKeyId, secretAccessKey")
        expect(createLlmClient(settings({ id: SYSTEM_AI_MODEL_ID, config: { apiKey: "sk" } }))).toBeInstanceOf(AnthropicLlmClient)
    })

    it("Given an organization's Azure OpenAI AI stored with an endpoint outside Azure, then no client is built, unless the installation allows the suffix", () => {
        const sovereign = settings({ provider: LlmProvider.AZURE_OPENAI, model: "gpt", config: { endpoint: "https://a.openai.azure.us/", apiKey: "k" } })

        expect(() => createLlmClient(settings({ provider: LlmProvider.AZURE_OPENAI, model: "gpt", config: { endpoint: "https://10.0.0.1/", apiKey: "k" } }))).toThrow("is an IP address")
        expect(() => createLlmClient(sovereign)).toThrow("is not an Azure OpenAI host")
        expect(createLlmClient(sovereign, { AZURE_OPENAI_ENDPOINT_SUFFIXES: ".openai.azure.us" })).toBeInstanceOf(AzureOpenAiLlmClient)
    })

    it("Given an Azure OpenAI AI, then its client does not follow redirects", () => {
        const client = createLlmClient(settings({ provider: LlmProvider.AZURE_OPENAI, model: "gpt", config: { endpoint: "https://a.openai.azure.com/", apiKey: "k" } }))

        expect((client as unknown as { client: { fetchOptions?: RequestInit } }).client.fetchOptions).toEqual({ redirect: "manual" })
    })

    it("Given each other provider, then its adapter is built with the AI's model", () => {
        expect(createLlmClient(settings({ provider: LlmProvider.AZURE_FOUNDRY, config: { resource: "res", apiKey: "k" } })).provider).toBe(LlmProvider.AZURE_FOUNDRY)
        expect(createLlmClient(settings({ provider: LlmProvider.GEMINI, model: "gemini-x" }))).toBeInstanceOf(GeminiLlmClient)
        expect(createLlmClient(settings({ provider: LlmProvider.AZURE_OPENAI, model: "gpt", config: { endpoint: "https://x.openai.azure.com", apiKey: "k" } }))).toBeInstanceOf(AzureOpenAiLlmClient)
    })
})

describe("getLlmClient", () => {
    it("Given the same AI asked twice, then one client serves both; once the AI is edited, a new one is built", () => {
        const first = getLlmClient(settings({ id: "cached", updatedAt: new Date(1) }))

        expect(getLlmClient(settings({ id: "cached", updatedAt: new Date(1) }))).toBe(first)
        expect(getLlmClient(settings({ id: "cached", updatedAt: new Date(2) }))).not.toBe(first)
    })

    it("Given a deleted AI, when it is forgotten, then its client is not served again", () => {
        const first = getLlmClient(settings({ id: "deleted", updatedAt: new Date(1) }))

        forgetLlmClient("deleted")

        expect(getLlmClient(settings({ id: "deleted", updatedAt: new Date(1) }))).not.toBe(first)
    })

    it("Given the system AI, which has no edit date, then a client is kept per configuration", () => {
        const system = systemAiModel({ ANTHROPIC_API_KEY: "sk-1" })!

        expect(getLlmClient(system)).toBe(getLlmClient(systemAiModel({ ANTHROPIC_API_KEY: "sk-1" })!))
        expect(getLlmClient(systemAiModel({ ANTHROPIC_API_KEY: "sk-2" })!)).not.toBe(getLlmClient(system))
    })
})

describe("aiProviderError", () => {
    it("Given a rate limit, then it keeps a code of its own; any other failure is generic, without the provider's message", () => {
        expect(aiProviderError({ status: 429, message: "slow down" })).toMatchObject({ code: "RATE_LIMITED", statusCode: 429 })
        const other = aiProviderError(Object.assign(new Error("404 <html>internal admin console</html>"), { status: 404 }))
        expect(other).toMatchObject({ code: "AI_PROVIDER_ERROR", statusCode: 502 })
        expect(other.message).not.toContain("internal")
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

    /** A Claude stream replaying the given thinking deltas, each with its snapshot as the SDK passes them, then ending on `content`. */
    const thinkingClaude = (deltas: [string, string][], content: unknown[]) => {
        const stream = vi.fn((_body: unknown) => ({
            on: vi.fn((event: string, listener: (delta: string, snapshot: string) => void) => {
                if (event === "thinking") for (const [delta, snapshot] of deltas) listener(delta, snapshot)
            }),
            finalMessage: async () => ({ content, stop_reason: "tool_use", usage: { input_tokens: 3, output_tokens: 4 } })
        }))
        return { client: { beta: { messages: { stream, create: vi.fn() } } } as unknown as ClaudeClient, stream }
    }

    it("Given an effort, then it is sent with summarized adaptive thinking, the reasoning streams to onThinking and the turn carries its summary", async () => {
        const content = [
            { type: "thinking", thinking: "Read the file first.", signature: "sig-1" },
            { type: "tool_use", id: "toolu_1", name: "read_file", input: { path: "a.ts" } }
        ]
        const { client, stream } = thinkingClaude(
            [
                ["Read the file", "Read the file"],
                [" first.", "Read the file first."]
            ],
            content
        )
        const streamed: string[] = []

        const result = await new AnthropicLlmClient(LlmProvider.ANTHROPIC, client, "claude-opus-5-5").turn({
            ...request([{ role: "user", text: "hi" }]),
            effort: "max",
            onThinking: delta => streamed.push(delta)
        })

        expect(stream.mock.calls[0][0]).toMatchObject({ output_config: { effort: "max" }, thinking: { type: "adaptive", display: "summarized" } })
        expect(streamed).toEqual(["Read the file", " first."])
        expect(result.thinking).toBe("Read the file first.")
        expect(result.message.native).toBe(content)
    })

    it("Given several thinking blocks in a turn, one of them empty, then they stream apart as in the turn's summary and nothing empty is streamed", async () => {
        const content = [
            { type: "thinking", thinking: "Read the file first.", signature: "sig-1" },
            { type: "thinking", thinking: "", signature: "sig-2" },
            { type: "thinking", thinking: "Then edit it.", signature: "sig-3" },
            { type: "tool_use", id: "toolu_1", name: "read_file", input: { path: "a.ts" } }
        ]
        const { client } = thinkingClaude(
            [
                ["Read the file first.", "Read the file first."],
                ["", ""],
                ["Then", "Then"],
                [" edit it.", "Then edit it."]
            ],
            content
        )
        const streamed: string[] = []

        const result = await new AnthropicLlmClient(LlmProvider.ANTHROPIC, client, "claude-opus-5-5").turn({ ...request([{ role: "user", text: "hi" }]), onThinking: delta => streamed.push(delta) })

        expect(streamed).toEqual(["Read the file first.", "\n\n", "Then", " edit it."])
        expect(streamed.join("")).toBe(result.thinking)
    })

    it("Given a turn whose only reasoning is empty, then nothing is streamed", async () => {
        const { client } = thinkingClaude([["", ""]], [{ type: "thinking", thinking: "", signature: "sig-1" }])
        const streamed: string[] = []

        await new AnthropicLlmClient(LlmProvider.ANTHROPIC, client, "claude-opus-5-5").turn({ ...request([{ role: "user", text: "hi" }]), onThinking: delta => streamed.push(delta) })

        expect(streamed).toEqual([])
    })

    it("Given a turn without reasoning, then it carries no summary", async () => {
        const { client } = fakeClaude([{ type: "text", text: "ok" }], "end_turn")

        expect((await new AnthropicLlmClient(LlmProvider.ANTHROPIC, client, "claude-opus-5-5").turn(request([{ role: "user", text: "hi" }]))).thinking).toBeUndefined()
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

    it.each(["xhigh", "max"] as const)("Given a reasoning deployment and the %s effort, then it is sent as high, which every reasoning model takes", async effort => {
        const { client, stream, create } = fakeAzure({ output: [message("{}")] })
        const llm = new AzureOpenAiLlmClient(client, "gpt-6", true)

        await llm.turn({ ...request([{ role: "user", text: "hi" }]), effort })
        await llm.json({ system: "s", user: "u", schema: { type: "object" }, maxTokens: 100, effort })

        expect(stream.mock.calls[0][0]).toMatchObject({ reasoning: { effort: "high" } })
        expect(create.mock.calls[0][0]).toMatchObject({ reasoning: { effort: "high" } })
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
