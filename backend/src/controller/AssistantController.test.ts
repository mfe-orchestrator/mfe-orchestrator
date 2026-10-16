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

vi.mock("../service/assistant/AssistantService", () => ({
    default: class {
        ensureCanChat = ensureCanChat
        takeConfirmation = takeConfirmation
        chat = chat
        draftProject = draftProject
    }
}))

const question = { messages: [{ role: "user", content: "Why did the build fail?" }], context: { page: "/builds" } }

describe("AssistantController", () => {
    let app: FastifyInstance

    beforeEach(async () => {
        ensureCanChat.mockReset().mockResolvedValue(undefined)
        takeConfirmation.mockReset()
        chat.mockReset()
        draftProject.mockReset()

        app = Fastify()
        app.decorate("config", { ANTHROPIC_API_KEY: "test-key", ASSISTANT_RATE_LIMIT_MAX: 20 } as never)
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

        const response = await app.inject({ method: "POST", url: "/assistant/project-draft", payload: { description: "A portal", locale: "it" } })

        expect(response.statusCode).toBe(200)
        expect(response.json().name).toBe("Portal")
        expect(draftProject).toHaveBeenCalledWith("A portal", "it")
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
})
