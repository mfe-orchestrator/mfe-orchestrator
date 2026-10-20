import { beforeEach, describe, expect, it, vi } from "vitest"
import { AssistantConversationMessageDTO } from "../../types/AssistantDTO"
import { deleteConversation, getConversation, saveConversation, toStoredMessage } from "./conversations"

const updateOne = vi.fn()
const findOne = vi.fn()

vi.mock("../../models/AssistantConversationModel", () => ({
    default: {
        updateOne: (...args: unknown[]) => updateOne(...args),
        findOne: (...args: unknown[]) => ({ lean: () => findOne(...args) })
    }
}))

const userId = "64b7f0c2a1b2c3d4e5f60701" as never
const projectId = "64b7f0c2a1b2c3d4e5f60718"

const answerWithTools = {
    id: "m2",
    role: "assistant",
    content: "Created the key.",
    status: "streaming",
    tools: [{ id: "t1", name: "api_key_create", title: "Create API key", kind: "write", status: "running", input: { name: "ci" }, result: { apiKey: "secret-value" } }],
    confirmation: {
        actionId: "a1",
        callId: "t1",
        name: "api_key_create",
        title: "Create API key",
        input: { name: "ci" },
        details: [{ label: "name", value: "ci" }],
        expiresAt: "2026-10-16T12:00:00Z",
        status: "approved"
    }
} as unknown as AssistantConversationMessageDTO

describe("conversations", () => {
    beforeEach(() => {
        updateOne.mockReset().mockResolvedValue({})
        findOne.mockReset()
    })

    it("Given an answer with tool inputs and results, when it is stored, then neither is kept", () => {
        const stored = toStoredMessage(answerWithTools)

        expect(JSON.stringify(stored)).not.toContain("secret-value")
        expect(stored.tools?.[0]).not.toHaveProperty("input")
        expect(stored.tools?.[0]).not.toHaveProperty("result")
        expect(stored.confirmation).not.toHaveProperty("input")
    })

    it("Given an answer saved while it streamed, when it is stored, then it reads as finished and its running calls as interrupted", () => {
        const stored = toStoredMessage(answerWithTools)

        expect(stored.status).toBe("done")
        expect(stored.tools?.[0].status).toBe("interrupted")
    })

    it("Given an answer longer than what is kept, when it is stored, then it is clipped instead of rejected", () => {
        const long = { ...answerWithTools, content: "x".repeat(100_000), confirmation: { ...answerWithTools.confirmation!, details: [{ label: "variables", value: "y".repeat(5_000) }] } }

        const stored = toStoredMessage(long)

        expect(stored.content).toHaveLength(64_000)
        expect(stored.confirmation?.details[0].value).toHaveLength(2_000)
    })

    it("Given an answer with its reasoning and effort, when it is stored, then both are kept, the reasoning clipped and masked like the answer", () => {
        const long = toStoredMessage({ ...answerWithTools, effort: "high", thinking: "z".repeat(100_000) })
        const withSecret = toStoredMessage({ ...answerWithTools, effort: "low", thinking: "The pipeline sets NPM_TOKEN=abcdef1234567890." })

        expect(long.effort).toBe("high")
        expect(long.thinking).toHaveLength(64_000)
        expect(withSecret.effort).toBe("low")
        expect(withSecret.thinking).not.toContain("abcdef1234567890")
    })

    it("Given an effort this server does not know, when it is stored, then it is dropped and the rest is kept", () => {
        const stored = toStoredMessage({ ...answerWithTools, effort: "turbo" as never, thinking: "Checked the logs." })

        expect(stored).not.toHaveProperty("effort")
        expect(stored.thinking).toBe("Checked the logs.")
    })

    it("Given an answer saved before reasoning was kept, when it is stored, then it gains no reasoning nor effort", () => {
        const stored = toStoredMessage(answerWithTools)

        expect(stored).not.toHaveProperty("thinking")
        expect(stored).not.toHaveProperty("effort")
    })

    it("Given a secret in the answer or in a confirmation card, when it is stored, then it is masked", () => {
        const withSecrets = {
            ...answerWithTools,
            content: "Set NPM_TOKEN=abcdef1234567890 in the pipeline.",
            confirmation: { ...answerWithTools.confirmation!, details: [{ label: "variables", value: "+ API_KEY = sk-live-123456789" }] }
        }

        const stored = toStoredMessage(withSecrets)

        expect(stored.content).not.toContain("abcdef1234567890")
        expect(stored.confirmation?.details[0].value).not.toContain("sk-live-123456789")
    })

    it("Given a conversation, when it is saved, then it is upserted for its user and project, titled by the first question, with no expiry", async () => {
        await saveConversation(userId, projectId, "conversation-1", [{ id: "m1", role: "user", content: "  Why did   the build\nfail? " }, answerWithTools])

        const [filter, update, options] = updateOne.mock.calls[0]
        expect(filter).toEqual({ _id: "conversation-1", userId, projectId, deletedAt: null })
        expect(options).toEqual({ upsert: true })
        expect(update.$set.title).toBe("Why did the build fail?")
        expect(update.$set).not.toHaveProperty("expiresAt")
    })

    it("Given a long first question, when the conversation is saved, then the title is shortened", async () => {
        await saveConversation(userId, projectId, "conversation-1", [{ id: "m1", role: "user", content: "x".repeat(500) }])

        expect(updateOne.mock.calls[0][1].$set.title).toHaveLength(80)
    })

    it("Given an id that belongs to another user or project, or was deleted, when it is saved, then it fails as not found", async () => {
        updateOne.mockRejectedValue(Object.assign(new Error("E11000 duplicate key"), { code: 11000 }))

        await expect(saveConversation(userId, projectId, "conversation-1", [{ id: "m1", role: "user", content: "Hi" }])).rejects.toMatchObject({ statusCode: 404 })
    })

    it("Given a conversation of someone else, or a deleted one, when it is opened, then it is not found", async () => {
        findOne.mockResolvedValue(null)

        await expect(getConversation(userId, projectId, "conversation-1")).rejects.toMatchObject({ statusCode: 404 })
        expect(findOne.mock.calls[0][0]).toEqual({ _id: "conversation-1", userId, projectId, deletedAt: null })
    })

    it("Given a conversation, when it is deleted, then it is only marked as deleted and stays in the database", async () => {
        updateOne.mockResolvedValue({ matchedCount: 1 })

        await deleteConversation(userId, projectId, "conversation-1")

        const [filter, update, options] = updateOne.mock.calls[0]
        expect(filter).toEqual({ _id: "conversation-1", userId, projectId, deletedAt: null })
        expect(update.$set.deletedAt).toBeInstanceOf(Date)
        expect(options).toBeUndefined()
    })

    it("Given no such conversation, or one already deleted, when it is deleted, then it is not found", async () => {
        updateOne.mockResolvedValue({ matchedCount: 0 })

        await expect(deleteConversation(userId, projectId, "conversation-1")).rejects.toMatchObject({ statusCode: 404 })
    })
})
