import { beforeEach, describe, expect, it, vi } from "vitest"
import AiModel from "../../models/AiModelModel"
import Project from "../../models/ProjectModel"
import { IUser } from "../../models/UserModel"
import BaseAuthorizedService from "../BaseAuthorizedService"
import AssistantService, { AssistantStreamHandlers } from "./AssistantService"
import { takePendingAction } from "./pendingActions"

const stream = vi.fn()
const create = vi.fn()
const geminiStream = vi.fn()
const azureStream = vi.fn()

vi.mock("@anthropic-ai/sdk", () => ({
    default: class {
        beta = { messages: { stream, create } }
    }
}))

vi.mock("@google/genai", async importOriginal => ({
    ...(await importOriginal<typeof import("@google/genai")>()),
    GoogleGenAI: class {
        models = { generateContentStream: geminiStream, generateContent: vi.fn() }
    }
}))

vi.mock("openai", () => ({
    default: class {
        responses = { stream: azureStream, create: vi.fn() }
    }
}))

const getEnvironments = vi.fn()
const deleteEnvironment = vi.fn()

vi.mock("../EnvironmentService", () => ({
    default: class {
        getByProjectId = getEnvironments
        deleteSingle = deleteEnvironment
    }
}))

/** A fake MessageStream: replays the text and thinking deltas to their listeners, then resolves with the message. */
const fakeStream = (message: { stop_reason: string; content: unknown[]; usage?: Record<string, number> }) => ({
    on: (event: string, listener: (delta: string) => void) => {
        for (const block of message.content as { type: string; text?: string; thinking?: string }[]) {
            if (event === "text" && block.type === "text" && block.text) listener(block.text)
            if (event === "thinking" && block.type === "thinking" && block.thinking) listener(block.thinking)
        }
    },
    finalMessage: async () => ({ usage: { input_tokens: 0, output_tokens: 0 }, ...message })
})

const user = { _id: "user-1" } as unknown as IUser
const ENVIRONMENT = "bbbbbbbbbbbbbbbbbbbbbbbb"
const ORGANIZATION = "cccccccccccccccccccccccc"
const PROJECT = "dddddddddddddddddddddddd"

/** Records every frame the service emits, in order. */
const recordingHandlers = () => {
    const frames: { event: string; frame: unknown }[] = []
    const handlers: AssistantStreamHandlers = {
        onText: delta => frames.push({ event: "text", frame: delta }),
        onThinking: delta => frames.push({ event: "thinking", frame: delta }),
        onToolCall: frame => frames.push({ event: "tool_call", frame }),
        onToolResult: frame => frames.push({ event: "tool_result", frame }),
        onConfirm: frame => frames.push({ event: "confirm", frame })
    }
    return { frames, handlers }
}

describe("AssistantService", () => {
    beforeEach(() => {
        stream.mockReset()
        create.mockReset()
        geminiStream.mockReset()
        azureStream.mockReset()
        getEnvironments.mockReset()
        deleteEnvironment.mockReset().mockResolvedValue(undefined)
        vi.spyOn(BaseAuthorizedService.prototype as unknown as { ensureAccessToProject: () => Promise<void> }, "ensureAccessToProject").mockResolvedValue(undefined)
        vi.spyOn(AssistantService.prototype as unknown as { getRoleInProject: () => Promise<string> }, "getRoleInProject").mockResolvedValue("MEMBER")
        vi.spyOn(BaseAuthorizedService.prototype as unknown as { ensureAccessToOrganization: () => Promise<void> }, "ensureAccessToOrganization").mockResolvedValue(undefined)
        vi.spyOn(Project, "findById").mockResolvedValue({ _id: PROJECT, organizationId: ORGANIZATION } as never)
        // The organization defines no AI: the system one, from the configuration the service is given, answers
        vi.spyOn(AiModel, "find").mockResolvedValue([] as never)
    })

    it("Given no AI from the organization nor the installation, when a question is asked, then the assistant reports itself disabled", async () => {
        await expect(new AssistantService(user, {}).ensureCanChat(PROJECT)).rejects.toMatchObject({ code: "ASSISTANT_DISABLED" })
    })

    it("Given an AI the project may not use, when a question is asked, then it is refused before the stream opens", async () => {
        await expect(new AssistantService(user, { ANTHROPIC_API_KEY: "test-key" }).ensureCanChat(PROJECT, "eeeeeeeeeeeeeeeeeeeeeeee")).rejects.toMatchObject({
            code: "AI_MODEL_NOT_AVAILABLE",
            statusCode: 422
        })
    })

    it("Given an AI of the organization chosen, when a question is answered, then it answers with that AI's model and the outcome names it", async () => {
        const opus = {
            _id: "eeeeeeeeeeeeeeeeeeeeeeee",
            name: "Org Claude",
            provider: "anthropic",
            modelId: "claude-sonnet-5-5",
            config: { apiKey: "sk-org" },
            isDefault: false,
            updatedAt: new Date(0)
        }
        vi.spyOn(AiModel, "find").mockResolvedValue([opus] as never)
        stream.mockReturnValueOnce(fakeStream({ stop_reason: "end_turn", content: [{ type: "text", text: "Hi" }] }))

        const outcome = await new AssistantService(user, { ANTHROPIC_API_KEY: "test-key" }).chat(
            PROJECT,
            { messages: [{ role: "user", content: "Hello" }], aiModelId: opus._id },
            recordingHandlers().handlers
        )

        expect(stream.mock.calls[0][0]).toMatchObject({ model: "claude-sonnet-5-5" })
        expect(outcome).toMatchObject({ aiModelId: opus._id, provider: "anthropic" })
    })

    it("Given a question that needs data, when answered, then the tool runs on the request's project and its result goes back to the model", async () => {
        getEnvironments.mockResolvedValue([{ _id: "env-1", name: "Production", slug: "prod", isProduction: true }])
        stream
            .mockReturnValueOnce(fakeStream({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "toolu_1", name: "environments_list", input: {} }] }))
            .mockReturnValueOnce(fakeStream({ stop_reason: "end_turn", content: [{ type: "text", text: "You have one environment: Production." }] }))

        const { frames, handlers } = recordingHandlers()
        const outcome = await new AssistantService(user, { ANTHROPIC_API_KEY: "test-key" }).chat(
            PROJECT,
            { messages: [{ role: "user", content: "Which environments do I have?" }], context: { page: "/environments" } },
            handlers
        )

        expect(outcome).toMatchObject({ stopReason: "end_turn", wrote: false })
        expect(frames.map(entry => entry.event)).toEqual(["tool_call", "tool_result", "text"])
        expect(frames[0].frame).toEqual({ id: "toolu_1", name: "environments_list", title: "List environments", input: {}, kind: "read" })
        expect(frames[2].frame).toBe("You have one environment: Production.")
        expect(getEnvironments).toHaveBeenCalledWith(PROJECT)

        const firstRequest = stream.mock.calls[0][0]
        expect(firstRequest.model).toBe("claude-opus-5-5")
        expect(firstRequest.messages[0].content).toContain("page: /environments")
        expect(firstRequest.messages[0].content).toContain("Which environments do I have?")
        expect(firstRequest.tools.map((tool: { name: string }) => tool.name)).toEqual(expect.arrayContaining(["environments_list", "deploy", "search_docs"]))

        const secondRequest = stream.mock.calls[1][0]
        const toolResultMessage = secondRequest.messages[secondRequest.messages.length - 1]
        expect(toolResultMessage.role).toBe("user")
        expect(toolResultMessage.content[0]).toMatchObject({ type: "tool_result", tool_use_id: "toolu_1" })
        expect(JSON.parse(toolResultMessage.content[0].content)[0]).toMatchObject({ _id: "env-1", name: "Production" })
    })

    it("Given an answer over several model rounds, then its usage is the sum of every round", async () => {
        getEnvironments.mockResolvedValue([])
        const usage = { input_tokens: 10, cache_read_input_tokens: 400, cache_creation_input_tokens: 50, output_tokens: 7 }
        stream
            .mockReturnValueOnce(fakeStream({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "toolu_1", name: "environments_list", input: {} }], usage }))
            .mockReturnValueOnce(fakeStream({ stop_reason: "end_turn", content: [{ type: "text", text: "None." }], usage }))

        const outcome = await new AssistantService(user, { ANTHROPIC_API_KEY: "test-key" }).chat(PROJECT, { messages: [{ role: "user", content: "?" }] }, recordingHandlers().handlers)

        expect(outcome.usage).toEqual({ inputTokens: 920, cachedInputTokens: 800, outputTokens: 14 })
    })

    it("Given a chosen effort and a model reasoning over two rounds, then the effort is sent, and the reasoning streams apart from the text with a break between rounds", async () => {
        getEnvironments.mockResolvedValue([])
        stream
            .mockReturnValueOnce(
                fakeStream({
                    stop_reason: "tool_use",
                    content: [
                        { type: "thinking", thinking: "Look the environments up.", signature: "sig-1" },
                        { type: "tool_use", id: "toolu_1", name: "environments_list", input: {} }
                    ]
                })
            )
            .mockReturnValueOnce(
                fakeStream({
                    stop_reason: "end_turn",
                    content: [
                        { type: "thinking", thinking: "There are none.", signature: "sig-2" },
                        { type: "text", text: "None." }
                    ]
                })
            )
        const { frames, handlers } = recordingHandlers()

        const outcome = await new AssistantService(user, { ANTHROPIC_API_KEY: "test-key" }).chat(PROJECT, { messages: [{ role: "user", content: "?" }], effort: "xhigh" }, handlers)

        expect(stream.mock.calls[0][0]).toMatchObject({ max_tokens: 64_000, output_config: { effort: "xhigh" }, thinking: { type: "adaptive", display: "summarized" } })
        expect(stream.mock.calls[1][0]).toMatchObject({ max_tokens: 64_000, output_config: { effort: "xhigh" } })
        expect(outcome.effort).toBe("xhigh")
        expect(frames.filter(entry => entry.event === "thinking").map(entry => entry.frame)).toEqual(["Look the environments up.", "\n\n", "There are none."])
        expect(frames.filter(entry => entry.event === "text").map(entry => entry.frame)).toEqual(["None."])
    })

    it("Given no effort chosen, when a question is answered, then it is answered at medium", async () => {
        stream.mockReturnValueOnce(fakeStream({ stop_reason: "end_turn", content: [{ type: "text", text: "Hi." }] }))

        const outcome = await new AssistantService(user, { ANTHROPIC_API_KEY: "test-key" }).chat(PROJECT, { messages: [{ role: "user", content: "Hi" }] }, recordingHandlers().handlers)

        expect(stream.mock.calls[0][0]).toMatchObject({ max_tokens: 16_000, output_config: { effort: "medium" } })
        expect(outcome.effort).toBe("medium")
    })

    it("Given an installation capped at high, when max is asked for, then the answer is given at high, with the room of high", async () => {
        stream.mockReturnValueOnce(fakeStream({ stop_reason: "end_turn", content: [{ type: "text", text: "Hi." }] }))

        const outcome = await new AssistantService(user, { ANTHROPIC_API_KEY: "test-key", AI_MAX_EFFORT: "high" }).chat(
            PROJECT,
            { messages: [{ role: "user", content: "Hi" }], effort: "max" },
            recordingHandlers().handlers
        )

        expect(stream.mock.calls[0][0]).toMatchObject({ max_tokens: 32_000, output_config: { effort: "high" } })
        expect(outcome.effort).toBe("high")
    })

    it("Given a refusal, when answered, then no tool runs and the refusal is reported", async () => {
        stream.mockReturnValueOnce(fakeStream({ stop_reason: "refusal", content: [{ type: "tool_use", id: "toolu_1", name: "environments_list", input: {} }] }))

        const outcome = await new AssistantService(user, { ANTHROPIC_API_KEY: "test-key" }).chat(PROJECT, { messages: [{ role: "user", content: "..." }] }, recordingHandlers().handlers)

        expect(outcome.stopReason).toBe("refusal")
        expect(getEnvironments).not.toHaveBeenCalled()
    })

    it("Given a model that keeps calling tools, when answered, then the loop stops after a bounded number of rounds", async () => {
        getEnvironments.mockResolvedValue([])
        stream.mockImplementation(() => fakeStream({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "toolu_1", name: "environments_list", input: {} }] }))

        const outcome = await new AssistantService(user, { ANTHROPIC_API_KEY: "test-key" }).chat(PROJECT, { messages: [{ role: "user", content: "loop" }] }, recordingHandlers().handlers)

        expect(outcome.stopReason).toBe("max_tool_rounds")
        expect(stream).toHaveBeenCalledTimes(16)
    })

    it("Given a destructive call, when the model makes it, then nothing is deleted and the turn stops waiting for the user's confirmation", async () => {
        stream.mockReturnValueOnce(
            fakeStream({
                stop_reason: "tool_use",
                content: [
                    { type: "text", text: "I will delete staging." },
                    { type: "tool_use", id: "toolu_1", name: "environment_delete", input: { environmentId: ENVIRONMENT } }
                ]
            })
        )

        const { frames, handlers } = recordingHandlers()
        const outcome = await new AssistantService(user, { ANTHROPIC_API_KEY: "test-key" }).chat(PROJECT, { messages: [{ role: "user", content: "Delete staging" }] }, handlers)

        expect(outcome).toMatchObject({ stopReason: "awaiting_confirmation", wrote: false })
        expect(stream).toHaveBeenCalledTimes(1)
        expect(deleteEnvironment).not.toHaveBeenCalled()
        expect(frames.map(entry => entry.event)).toEqual(["text", "tool_call", "confirm"])
    })

    it("Given an approved confirmation, when the turn resumes, then the action runs and the model carries on from its own call with the outcome", async () => {
        stream.mockReturnValueOnce(fakeStream({ stop_reason: "end_turn", content: [{ type: "text", text: "Staging is gone." }] }))
        const action = { id: "a1", userId: "user-1", projectId: PROJECT, tool: "environment_delete", args: { environmentId: ENVIRONMENT }, callId: "toolu_1", createdAt: 0, expiresAt: 0 }

        const { frames, handlers } = recordingHandlers()
        const outcome = await new AssistantService(user, { ANTHROPIC_API_KEY: "test-key" }).chat(
            PROJECT,
            {
                messages: [
                    { role: "user", content: "Delete staging" },
                    { role: "assistant", content: "I will delete staging." }
                ]
            },
            handlers,
            undefined,
            { action, approved: true }
        )

        expect(outcome).toMatchObject({ stopReason: "end_turn", wrote: true })
        expect(deleteEnvironment).toHaveBeenCalledWith(ENVIRONMENT)
        expect(frames[0]).toEqual({ event: "tool_result", frame: { id: "toolu_1", ok: true, summary: "Done", result: { deleted: true } } })

        const request = stream.mock.calls[0][0]
        expect(request.messages).toHaveLength(3)
        expect(request.messages[0].content).toContain("<console_context>")
        expect(request.messages[1]).toEqual({
            role: "assistant",
            content: [
                { type: "text", text: "I will delete staging." },
                { type: "tool_use", id: "toolu_1", name: "environment_delete", input: { environmentId: ENVIRONMENT } }
            ]
        })
        expect(request.messages[2].content[0]).toMatchObject({ type: "tool_result", tool_use_id: "toolu_1", content: 'Done: {"deleted":true}' })
    })

    it("Given a declined confirmation after a conversation ending with the user, when the turn resumes, then nothing runs and the model is told the user declined", async () => {
        stream.mockReturnValueOnce(fakeStream({ stop_reason: "end_turn", content: [{ type: "text", text: "Ok, I left it." }] }))
        const action = { id: "a1", userId: "user-1", projectId: PROJECT, tool: "environment_delete", args: { environmentId: ENVIRONMENT }, callId: "toolu_1", createdAt: 0, expiresAt: 0 }

        const outcome = await new AssistantService(user, { ANTHROPIC_API_KEY: "test-key" }).chat(
            PROJECT,
            { messages: [{ role: "user", content: "Delete staging" }] },
            recordingHandlers().handlers,
            undefined,
            { action, approved: false }
        )

        expect(outcome).toMatchObject({ stopReason: "end_turn", wrote: false })
        expect(deleteEnvironment).not.toHaveBeenCalled()
        const request = stream.mock.calls[0][0]
        expect(request.messages[1].content).toEqual([{ type: "tool_use", id: "toolu_1", name: "environment_delete", input: { environmentId: ENVIRONMENT } }])
        expect(request.messages[2].content[0]).toMatchObject({ tool_use_id: "toolu_1", content: "The user declined." })
    })

    /**
     * A round with a read and a destructive call, then the answer to its confirmation: the resumed
     * request must carry the provider's own message (thinking, signatures) and every result of the
     * round, the confirmed call's being the real outcome.
     */
    describe("resuming a turn after a confirmation", () => {
        const chatOnce = async (config: Record<string, string>, confirmation?: { actionId: string; approved: boolean }) => {
            const service = new AssistantService(user, config)
            const { frames, handlers } = recordingHandlers()
            const messages = [{ role: "user" as const, content: "Delete staging" }, ...(confirmation ? [{ role: "assistant" as const, content: "Checking first." }] : [])]
            const action = confirmation ? await takePendingAction(confirmation.actionId, "user-1", PROJECT) : undefined
            const outcome = await service.chat(PROJECT, { messages }, handlers, undefined, action && confirmation ? { action, approved: confirmation.approved } : undefined)
            return { outcome, frames }
        }

        const confirmOf = (frames: { event: string; frame: unknown }[]) => frames.find(entry => entry.event === "confirm")!.frame as { actionId: string; callId: string }

        beforeEach(() => {
            getEnvironments.mockResolvedValue([{ _id: ENVIRONMENT, name: "Staging" }])
        })

        it("Given Claude with thinking, when the turn resumes, then its native content and both results go back, the confirmed one with its outcome", async () => {
            const native = [
                { type: "thinking", thinking: "", signature: "sig-claude" },
                { type: "text", text: "Checking first." },
                { type: "tool_use", id: "toolu_read", name: "environments_list", input: {} },
                { type: "tool_use", id: "toolu_delete", name: "environment_delete", input: { environmentId: ENVIRONMENT } }
            ]
            stream
                .mockReturnValueOnce(fakeStream({ stop_reason: "tool_use", content: native }))
                .mockReturnValueOnce(fakeStream({ stop_reason: "end_turn", content: [{ type: "text", text: "Done." }] }))
            const config = { ANTHROPIC_API_KEY: "test-key" }

            const first = await chatOnce(config)
            const { outcome } = await chatOnce(config, { actionId: confirmOf(first.frames).actionId, approved: true })

            expect(first.outcome.stopReason).toBe("awaiting_confirmation")
            expect(outcome).toMatchObject({ stopReason: "end_turn", wrote: true })
            const sent = stream.mock.calls[1][0].messages
            expect(sent).toHaveLength(3)
            expect(sent[1]).toEqual({ role: "assistant", content: native })
            expect(sent[2].content).toEqual([
                expect.objectContaining({ type: "tool_result", tool_use_id: "toolu_read", content: expect.stringContaining("Staging") }),
                expect.objectContaining({ type: "tool_result", tool_use_id: "toolu_delete", content: 'Done: {"deleted":true}' })
            ])
        })

        it("Given Gemini with thought signatures and unnumbered calls, when the declined turn resumes, then the signed parts go back and the call is answered as declined", async () => {
            const parts = [
                { functionCall: { name: "environments_list", args: {} }, thoughtSignature: "sig-gemini" },
                { functionCall: { name: "environment_delete", args: { environmentId: ENVIRONMENT } } }
            ]
            geminiStream
                .mockResolvedValueOnce(
                    (async function* () {
                        yield { candidates: [{ content: { parts }, finishReason: "STOP" }] }
                    })()
                )
                .mockResolvedValueOnce(
                    (async function* () {
                        yield { candidates: [{ content: { parts: [{ text: "Left it." }] }, finishReason: "STOP" }] }
                    })()
                )
            const config = { AI_PROVIDER: "gemini", GEMINI_API_KEY: "k", GEMINI_MODEL: "gemini-x" }

            const first = await chatOnce(config)
            const confirm = confirmOf(first.frames)
            await chatOnce(config, { actionId: confirm.actionId, approved: false })

            expect(deleteEnvironment).not.toHaveBeenCalled()
            const contents = geminiStream.mock.calls[1][0].contents
            expect(contents).toHaveLength(3)
            expect(contents[1].parts[0]).toMatchObject({ thoughtSignature: "sig-gemini", functionCall: { name: "environments_list" } })
            expect(contents[1].parts[1].functionCall.id).toBe(confirm.callId)
            expect(contents[2].parts).toEqual([
                expect.objectContaining({ functionResponse: expect.objectContaining({ name: "environments_list" }) }),
                { functionResponse: { id: confirm.callId, name: "environment_delete", response: { output: "The user declined." } } }
            ])
        })

        it("Given Azure OpenAI with encrypted reasoning, when the turn resumes, then the reasoning and both calls are replayed with their outputs", async () => {
            const output = [
                { type: "reasoning", id: "rs_1", summary: [], encrypted_content: "enc" },
                { type: "function_call", id: "fc_1", call_id: "call_read", name: "environments_list", arguments: "{}", status: "completed" },
                { type: "function_call", id: "fc_2", call_id: "call_delete", name: "environment_delete", arguments: JSON.stringify({ environmentId: ENVIRONMENT }), status: "completed" }
            ]
            const response = (items: unknown[]) => ({
                on: vi.fn(),
                finalResponse: async () => ({ status: "completed", incomplete_details: null, usage: { input_tokens: 0, output_tokens: 0 }, output: items })
            })
            azureStream
                .mockReturnValueOnce(response(output))
                .mockReturnValueOnce(response([{ type: "message", id: "m", role: "assistant", status: "completed", content: [{ type: "output_text", text: "Done.", annotations: [] }] }]))
            const config = { AI_PROVIDER: "azure-openai", AZURE_OPENAI_ENDPOINT: "https://x.openai.azure.com", AZURE_OPENAI_API_KEY: "k", AZURE_OPENAI_DEPLOYMENT: "gpt" }

            const first = await chatOnce(config)
            await chatOnce(config, { actionId: confirmOf(first.frames).actionId, approved: true })

            const input = azureStream.mock.calls[1][0].input
            expect(input.slice(1, 4)).toEqual(output)
            expect(input[4]).toMatchObject({ type: "function_call_output", call_id: "call_read" })
            expect(input[5]).toEqual({ type: "function_call_output", call_id: "call_delete", output: 'Done: {"deleted":true}' })
        })
    })

    it("Given a project description, when a draft is asked, then the structured answer is parsed", async () => {
        const draft = {
            name: "Customer portal",
            description: "Self-service area",
            environments: [{ name: "Production", slug: "prod", isProduction: true, color: "#DC2626" }],
            storage: "AWS_S3",
            codeRepository: "GITHUB",
            notes: ""
        }
        create.mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(draft) }] })

        await expect(new AssistantService(user, { ANTHROPIC_API_KEY: "test-key" }).draftProject(ORGANIZATION, "A portal on AWS, code on GitHub", "en")).resolves.toEqual(draft)
        expect(create.mock.calls[0][0].output_config.format.type).toBe("json_schema")
    })
})
