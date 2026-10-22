import RateLimit from "@fastify/rate-limit"
import Fastify, { FastifyInstance } from "fastify"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import AssistantDisabledError from "../errors/AssistantDisabledError"
import { createBusinessException } from "../errors/BusinessException"
import errorHandler from "../plugins/errorHandler"
import assistantController from "./AssistantController"

const ensureCanChat = vi.fn()
const takeConfirmation = vi.fn()
const chat = vi.fn()
const draftProject = vi.fn()
const saveUsage = vi.fn()
const conversations = vi.hoisted(() => ({ listConversations: vi.fn(), getConversation: vi.fn(), saveConversation: vi.fn(), deleteConversation: vi.fn() }))

vi.mock("../service/assistant/AssistantService", () => ({
    default: class {
        ensureCanChat = ensureCanChat
        takeConfirmation = takeConfirmation
        chat = chat
        draftProject = draftProject
    }
}))

vi.mock("../models/AssistantUsageModel", () => ({ default: { create: (...args: unknown[]) => saveUsage(...args) } }))

vi.mock("../service/assistant/conversations", () => conversations)

const question = { messages: [{ role: "user", content: "Why did the build fail?" }], context: { page: "/builds" } }

describe("AssistantController", () => {
    let app: FastifyInstance

    beforeEach(async () => {
        ensureCanChat.mockReset().mockResolvedValue(undefined)
        takeConfirmation.mockReset()
        chat.mockReset()
        draftProject.mockReset()
        saveUsage.mockReset().mockResolvedValue({})
        Object.values(conversations).forEach(mock => mock.mockReset().mockResolvedValue(undefined))

        app = Fastify()
        app.decorate("config", { ANTHROPIC_API_KEY: "test-key", ASSISTANT_RATE_LIMIT_MAX: 20 } as never)
        app.decorateRequest("databaseUser", null as never)
        app.addHook("onRequest", async request => {
            request.databaseUser = { _id: "user-1" } as never
        })
        await app.register(errorHandler)
        await app.register(assistantController)
    })

    afterEach(async () => {
        await app.close()
    })

    it("Given no project header, when a question is asked, then the request is rejected before anything is streamed", async () => {
        const response = await app.inject({ method: "POST", url: "/assistant/chat", payload: question })

        expect(response.statusCode).toBeGreaterThanOrEqual(400)
        expect(chat).not.toHaveBeenCalled()
    })

    it("Given an AI the project may not use, when a question asks for it, then it answers 422 with the code instead of opening a stream", async () => {
        ensureCanChat.mockRejectedValue(createBusinessException({ code: "AI_MODEL_NOT_AVAILABLE", message: "not here", statusCode: 422 }))

        const response = await app.inject({ method: "POST", url: "/assistant/chat", headers: { "project-id": "project-1" }, payload: { ...question, aiModelId: "system" } })

        expect(ensureCanChat).toHaveBeenCalledWith("project-1", "system")
        expect(response.statusCode).toBe(422)
        expect(response.headers["content-type"]).not.toContain("text/event-stream")
        expect(chat).not.toHaveBeenCalled()
    })

    it("Given an installation without the assistant, when a question is asked, then it answers 404 instead of opening a stream", async () => {
        ensureCanChat.mockRejectedValue(new AssistantDisabledError())

        const response = await app.inject({ method: "POST", url: "/assistant/chat", headers: { "project-id": "project-1" }, payload: question })

        expect(response.statusCode).toBe(404)
        expect(response.headers["content-type"]).not.toContain("text/event-stream")
    })

    it("Given a conversation that does not end with the user, when it is sent, then it is rejected", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/assistant/chat",
            headers: { "project-id": "project-1" },
            payload: { messages: [...question.messages, { role: "assistant", content: "..." }] }
        })

        expect(response.statusCode).toBe(400)
        expect(chat).not.toHaveBeenCalled()
    })

    it("Given an oversized message, when it is sent, then the schema rejects it", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/assistant/chat",
            headers: { "project-id": "project-1" },
            payload: { messages: [{ role: "user", content: "x".repeat(8_001) }] }
        })

        expect(response.statusCode).toBe(400)
    })

    it("Given a valid question, when it is answered, then tool, text and done frames are streamed in order", async () => {
        chat.mockImplementation(async (_projectId, _request, handlers) => {
            handlers.onToolCall({ id: "c1", name: "build_status_get", title: "Get build status", input: {}, kind: "read" })
            handlers.onToolResult({ id: "c1", ok: true, summary: "1 result", result: [{ status: "failed" }] })
            handlers.onText("The build ")
            handlers.onText("failed on lint.")
            return { stopReason: "end_turn", wrote: false }
        })

        const response = await app.inject({ method: "POST", url: "/assistant/chat", headers: { "project-id": "project-1" }, payload: question })

        expect(response.statusCode).toBe(200)
        expect(response.headers["content-type"]).toContain("text/event-stream")
        expect(chat.mock.calls[0][0]).toBe("project-1")
        expect(chat.mock.calls[0][4]).toBeUndefined()
        expect(takeConfirmation).not.toHaveBeenCalled()
        expect(response.body).toBe(
            [
                'event: tool_call\ndata: {"id":"c1","name":"build_status_get","title":"Get build status","input":{},"kind":"read"}\n\n',
                'event: tool_result\ndata: {"id":"c1","ok":true,"summary":"1 result","result":[{"status":"failed"}]}\n\n',
                'event: text\ndata: {"delta":"The build "}\n\n',
                'event: text\ndata: {"delta":"failed on lint."}\n\n',
                'event: done\ndata: {"stopReason":"end_turn","wrote":false}\n\n'
            ].join("")
        )
    })

    it("Given an effort the model does not know, when a question is sent, then the schema rejects it", async () => {
        const response = await app.inject({ method: "POST", url: "/assistant/chat", headers: { "project-id": "project-1" }, payload: { ...question, effort: "extreme" } })

        expect(response.statusCode).toBe(400)
        expect(chat).not.toHaveBeenCalled()
    })

    it("Given a chosen effort, when the question is answered, then it reaches the service, the reasoning streams as thinking frames and the usage records the effort", async () => {
        const usage = { inputTokens: 10, cachedInputTokens: 0, outputTokens: 5 }
        chat.mockImplementation(async (_projectId, _request, handlers) => {
            handlers.onThinking("Check the logs.")
            handlers.onText("Lint failed.")
            return { stopReason: "end_turn", wrote: false, usage, effort: "xhigh", aiModelId: "system", provider: "anthropic" }
        })

        const response = await app.inject({ method: "POST", url: "/assistant/chat", headers: { "project-id": "64b7f0c2a1b2c3d4e5f60718" }, payload: { ...question, effort: "xhigh" } })

        expect(chat.mock.calls[0][1]).toMatchObject({ effort: "xhigh" })
        expect(response.body).toContain('event: thinking\ndata: {"delta":"Check the logs."}\n\nevent: text\ndata: {"delta":"Lint failed."}')
        expect(saveUsage).toHaveBeenCalledWith(expect.objectContaining({ stopReason: "end_turn", effort: "xhigh", aiModelId: "system", provider: "anthropic", ...usage }))
    })

    it("Given a destructive call, when the turn stops on it, then a confirm frame and a done frame awaiting confirmation are streamed", async () => {
        const confirm = { actionId: "a1", callId: "c1", name: "environment_delete", title: "Delete environment", input: { environmentId: "e1" }, expiresAt: "2026-10-15T10:15:00.000Z" }
        chat.mockImplementation(async (_projectId, _request, handlers) => {
            handlers.onConfirm(confirm)
            return { stopReason: "awaiting_confirmation", wrote: false }
        })

        const response = await app.inject({ method: "POST", url: "/assistant/chat", headers: { "project-id": "project-1" }, payload: question })

        expect(response.body).toBe([`event: confirm\ndata: ${JSON.stringify(confirm)}\n\n`, 'event: done\ndata: {"stopReason":"awaiting_confirmation","wrote":false}\n\n'].join(""))
    })

    it("Given a confirmation, when the conversation ends with the assistant's message, then the action is taken for this project and the turn resumes with it", async () => {
        const action = { id: "a1", tool: "environment_delete" }
        takeConfirmation.mockResolvedValue(action)
        chat.mockResolvedValue({ stopReason: "end_turn", wrote: true })

        const response = await app.inject({
            method: "POST",
            url: "/assistant/chat",
            headers: { "project-id": "project-1" },
            payload: { messages: [...question.messages, { role: "assistant", content: "I will delete staging." }], confirmation: { actionId: "a1", approved: true } }
        })

        expect(response.statusCode).toBe(200)
        expect(takeConfirmation).toHaveBeenCalledWith("project-1", "a1")
        expect(chat.mock.calls[0][4]).toEqual({ action, approved: true })
        expect(response.body).toContain('event: done\ndata: {"stopReason":"end_turn","wrote":true}')
    })

    it("Given an answer, when it ends, then its tokens are saved for the project", async () => {
        const usage = { inputTokens: 1200, cachedInputTokens: 800, outputTokens: 150 }
        chat.mockResolvedValue({ stopReason: "end_turn", wrote: false, usage })

        await app.inject({ method: "POST", url: "/assistant/chat", headers: { "project-id": "64b7f0c2a1b2c3d4e5f60718" }, payload: question })

        expect(saveUsage).toHaveBeenCalledWith(expect.objectContaining({ projectId: "64b7f0c2a1b2c3d4e5f60718", stopReason: "end_turn", ...usage }))
    })

    it("Given the usage cannot be saved, when the answer ends, then the stream still closes with done and no error", async () => {
        chat.mockResolvedValue({ stopReason: "end_turn", wrote: false, usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 } })
        saveUsage.mockRejectedValue(new Error("mongo down"))

        const response = await app.inject({ method: "POST", url: "/assistant/chat", headers: { "project-id": "project-1" }, payload: question })

        expect(response.body).toContain("event: done")
        expect(response.body).not.toContain("event: error")
    })

    it("Given an expired or already answered confirmation, when it is sent, then it fails with an HTTP error before any stream", async () => {
        takeConfirmation.mockRejectedValue(createBusinessException({ code: "ASSISTANT_ACTION_NOT_FOUND", message: "This confirmation has expired or was already answered", statusCode: 409 }))

        const response = await app.inject({
            method: "POST",
            url: "/assistant/chat",
            headers: { "project-id": "project-1" },
            payload: { messages: question.messages, confirmation: { actionId: "a1", approved: true } }
        })

        expect(response.statusCode).toBe(409)
        expect(response.headers["content-type"]).not.toContain("text/event-stream")
        expect(chat).not.toHaveBeenCalled()
    })

    it.each([{ actionId: "a1" }, { actionId: "", approved: true }, { actionId: "a1", approved: "yes" }, { actionId: "x".repeat(101), approved: true }])(
        "Given a malformed confirmation %j, when it is sent, then the schema rejects it",
        async confirmation => {
            const response = await app.inject({ method: "POST", url: "/assistant/chat", headers: { "project-id": "project-1" }, payload: { messages: question.messages, confirmation } })

            expect(response.statusCode).toBe(400)
            expect(takeConfirmation).not.toHaveBeenCalled()
            expect(chat).not.toHaveBeenCalled()
        }
    )

    it("Given the model call fails mid-answer, when streaming, then an error frame closes the stream", async () => {
        chat.mockImplementation(async (_projectId, _request, handlers) => {
            handlers.onText("Partial")
            throw new Error("boom")
        })

        const response = await app.inject({ method: "POST", url: "/assistant/chat", headers: { "project-id": "project-1" }, payload: question })

        expect(response.body).toContain('event: text\ndata: {"delta":"Partial"}')
        expect(response.body).toContain('event: error\ndata: {"code":"ASSISTANT_ERROR"}')
    })

    it("Given a project description, when a draft is asked, then the draft is returned", async () => {
        draftProject.mockResolvedValue({ name: "Portal", description: "", environments: [], storage: "NONE", codeRepository: "NONE", notes: "" })

        const response = await app.inject({
            method: "POST",
            url: "/assistant/project-draft",
            payload: { organizationId: "64b7f0c2a1b2c3d4e5f60719", description: "A portal", locale: "it", aiModelId: "system" }
        })

        expect(response.statusCode).toBe(200)
        expect(response.json().name).toBe("Portal")
        expect(draftProject).toHaveBeenCalledWith("64b7f0c2a1b2c3d4e5f60719", "A portal", "it", "system")
    })

    it("Given a draft asked without the organization, when it is sent, then it is rejected: the AIs are the organization's", async () => {
        const response = await app.inject({ method: "POST", url: "/assistant/project-draft", payload: { description: "A portal", locale: "it" } })

        expect(response.statusCode).toBe(400)
        expect(draftProject).not.toHaveBeenCalled()
    })

    it("Given a rate limit of the assistant's own, when it is exceeded, then further questions get 429 while the rest of the API is unaffected", async () => {
        const limited = Fastify()
        limited.decorate("config", { ANTHROPIC_API_KEY: "test-key", ASSISTANT_RATE_LIMIT_MAX: 2 } as never)
        await limited.register(RateLimit, { max: 100, timeWindow: "1 minute" })
        await limited.register(assistantController)
        chat.mockResolvedValue({ stopReason: "end_turn", wrote: false })

        const ask = () => limited.inject({ method: "POST", url: "/assistant/chat", headers: { "project-id": "project-1" }, payload: question })
        expect((await ask()).statusCode).toBe(200)
        expect((await ask()).statusCode).toBe(200)
        expect((await ask()).statusCode).toBe(429)

        await limited.close()
    })

    describe("conversations", () => {
        const headers = { "project-id": "64b7f0c2a1b2c3d4e5f60718" }

        it("Given a project, when the history is asked for, then it lists the user's conversations there", async () => {
            conversations.listConversations.mockResolvedValue([{ id: "conversation-1", title: "Why did the build fail?", updatedAt: "2026-10-16T10:00:00.000Z" }])

            const response = await app.inject({ method: "GET", url: "/assistant/conversations", headers })

            expect(response.statusCode).toBe(200)
            expect(conversations.listConversations).toHaveBeenCalledWith("user-1", headers["project-id"])
            expect(response.json()).toHaveLength(1)
        })

        it("Given an installation without the assistant, when the history is asked for, then it answers 404", async () => {
            ensureCanChat.mockRejectedValue(new AssistantDisabledError())

            const response = await app.inject({ method: "GET", url: "/assistant/conversations", headers })

            expect(response.statusCode).toBe(404)
            expect(conversations.listConversations).not.toHaveBeenCalled()
        })

        it("Given a conversation, when it is saved, then it is stored for the user and project", async () => {
            const messages = [{ id: "m1", role: "user", content: "Why did the build fail?" }]

            const response = await app.inject({ method: "PUT", url: "/assistant/conversations/conversation-1", headers, payload: { messages } })

            expect(response.statusCode).toBe(204)
            expect(conversations.saveConversation).toHaveBeenCalledWith("user-1", headers["project-id"], "conversation-1", messages)
        })

        it("Given answers with their reasoning and effort, a level unknown to this server among them, when saved, then nothing is rejected and all reach the store", async () => {
            const messages = [
                { id: "m1", role: "user", content: "Why did the build fail?" },
                { id: "m2", role: "assistant", content: "Lint failed.", thinking: "Check the logs.", effort: "xhigh" },
                { id: "m3", role: "assistant", content: "Fixed.", effort: "turbo" }
            ]

            const response = await app.inject({ method: "PUT", url: "/assistant/conversations/conversation-1", headers, payload: { messages } })

            expect(response.statusCode).toBe(204)
            expect(conversations.saveConversation).toHaveBeenCalledWith("user-1", headers["project-id"], "conversation-1", messages)
        })

        it("Given an id that is not a plain token, when a conversation is saved, then the schema rejects it", async () => {
            const response = await app.inject({ method: "PUT", url: "/assistant/conversations/bad$id!!", headers, payload: { messages: [{ id: "m1", role: "user", content: "Hi" }] } })

            expect(response.statusCode).toBe(400)
            expect(conversations.saveConversation).not.toHaveBeenCalled()
        })

        it("Given a conversation, when it is opened and then deleted, then both act on that id for the user", async () => {
            conversations.getConversation.mockResolvedValue({ id: "conversation-1", title: "t", updatedAt: "2026-10-16T10:00:00.000Z", messages: [] })

            const opened = await app.inject({ method: "GET", url: "/assistant/conversations/conversation-1", headers })
            const deleted = await app.inject({ method: "DELETE", url: "/assistant/conversations/conversation-1", headers })

            expect(opened.statusCode).toBe(200)
            expect(conversations.getConversation).toHaveBeenCalledWith("user-1", headers["project-id"], "conversation-1")
            expect(deleted.statusCode).toBe(204)
            expect(conversations.deleteConversation).toHaveBeenCalledWith("user-1", headers["project-id"], "conversation-1")
        })
    })
})
