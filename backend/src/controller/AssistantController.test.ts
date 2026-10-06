import RateLimit from "@fastify/rate-limit"
import Fastify, { FastifyInstance } from "fastify"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import AssistantDisabledError from "../errors/AssistantDisabledError"
import errorHandler from "../plugins/errorHandler"
import assistantController from "./AssistantController"

const ensureCanChat = vi.fn()
const chat = vi.fn()
const draftProject = vi.fn()

vi.mock("../service/assistant/AssistantService", () => ({
    default: class {
        ensureCanChat = ensureCanChat
        chat = chat
        draftProject = draftProject
    }
}))

const question = { messages: [{ role: "user", content: "Why did the build fail?" }], context: { page: "/builds" } }

describe("AssistantController", () => {
    let app: FastifyInstance

    beforeEach(async () => {
        ensureCanChat.mockReset().mockResolvedValue(undefined)
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

    it("Given a valid question, when it is answered, then text, tool and done frames are streamed in order", async () => {
        chat.mockImplementation(async (_projectId, _request, handlers) => {
            handlers.onToolCall("get_build_status")
            handlers.onText("The build ")
            handlers.onText("failed on lint.")
            return "end_turn"
        })

        const response = await app.inject({ method: "POST", url: "/assistant/chat", headers: { "project-id": "project-1" }, payload: question })

        expect(response.statusCode).toBe(200)
        expect(response.headers["content-type"]).toContain("text/event-stream")
        expect(chat.mock.calls[0][0]).toBe("project-1")
        expect(response.body).toBe(
            [
                'event: tool\ndata: {"name":"get_build_status"}\n\n',
                'event: text\ndata: {"delta":"The build "}\n\n',
                'event: text\ndata: {"delta":"failed on lint."}\n\n',
                'event: done\ndata: {"stopReason":"end_turn"}\n\n'
            ].join("")
        )
    })

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
        chat.mockResolvedValue("end_turn")

        const ask = () => limited.inject({ method: "POST", url: "/assistant/chat", headers: { "project-id": "project-1" }, payload: question })
        expect((await ask()).statusCode).toBe(200)
        expect((await ask()).statusCode).toBe(200)
        expect((await ask()).statusCode).toBe(429)

        await limited.close()
    })
})
