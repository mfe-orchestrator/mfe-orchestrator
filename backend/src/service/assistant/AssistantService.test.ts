import { beforeEach, describe, expect, it, vi } from "vitest"
import { IUser } from "../../models/UserModel"
import BaseAuthorizedService from "../BaseAuthorizedService"
import AssistantService from "./AssistantService"

const stream = vi.fn()
const create = vi.fn()

vi.mock("@anthropic-ai/sdk", () => ({
    default: class {
        beta = { messages: { stream, create } }
    }
}))

const getEnvironments = vi.fn()

vi.mock("../EnvironmentService", () => ({
    default: class {
        getByProjectId = getEnvironments
    }
}))

/** A fake MessageStream: replays the text deltas to the listener, then resolves with the message. */
const fakeStream = (message: { stop_reason: string; content: unknown[] }) => ({
    on: (_event: string, listener: (delta: string) => void) => {
        for (const block of message.content as { type: string; text?: string }[]) {
            if (block.type === "text" && block.text) listener(block.text)
        }
    },
    finalMessage: async () => message
})

const user = { _id: "user-1" } as unknown as IUser

describe("AssistantService", () => {
    beforeEach(() => {
        stream.mockReset()
        create.mockReset()
        getEnvironments.mockReset()
        vi.spyOn(BaseAuthorizedService.prototype as unknown as { ensureAccessToProject: () => Promise<void> }, "ensureAccessToProject").mockResolvedValue(undefined)
    })

    it("Given no API key, when a question is asked, then the assistant reports itself disabled", async () => {
        await expect(new AssistantService(user, undefined).ensureCanChat("project-1")).rejects.toMatchObject({ code: "ASSISTANT_DISABLED" })
    })

    it("Given a question that needs data, when answered, then the tool runs on the request's project and its result goes back to the model", async () => {
        getEnvironments.mockResolvedValue([{ _id: "env-1", name: "Production", slug: "prod", isProduction: true }])
        stream
            .mockReturnValueOnce(fakeStream({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "toolu_1", name: "list_environments", input: {} }] }))
            .mockReturnValueOnce(fakeStream({ stop_reason: "end_turn", content: [{ type: "text", text: "You have one environment: Production." }] }))

        const texts: string[] = []
        const toolCalls: string[] = []
        const stopReason = await new AssistantService(user, "test-key").chat(
            "project-1",
            { messages: [{ role: "user", content: "Which environments do I have?" }], context: { page: "/environments" } },
            { onText: delta => texts.push(delta), onToolCall: name => toolCalls.push(name) }
        )

        expect(stopReason).toBe("end_turn")
        expect(toolCalls).toEqual(["list_environments"])
        expect(texts.join("")).toBe("You have one environment: Production.")
        expect(getEnvironments).toHaveBeenCalledWith("project-1")

        const firstRequest = stream.mock.calls[0][0]
        expect(firstRequest.model).toBe("claude-opus-5-5")
        expect(firstRequest.messages[0].content).toContain("page: /environments")
        expect(firstRequest.messages[0].content).toContain("Which environments do I have?")

        const secondRequest = stream.mock.calls[1][0]
        const toolResultMessage = secondRequest.messages[secondRequest.messages.length - 1]
        expect(toolResultMessage.role).toBe("user")
        expect(toolResultMessage.content[0]).toMatchObject({ type: "tool_result", tool_use_id: "toolu_1" })
        expect(JSON.parse(toolResultMessage.content[0].content)[0]).toMatchObject({ id: "env-1", name: "Production" })
    })

    it("Given a refusal, when answered, then no tool runs and the refusal is reported", async () => {
        stream.mockReturnValueOnce(fakeStream({ stop_reason: "refusal", content: [{ type: "tool_use", id: "toolu_1", name: "list_environments", input: {} }] }))

        const stopReason = await new AssistantService(user, "test-key").chat("project-1", { messages: [{ role: "user", content: "..." }] }, { onText: () => undefined, onToolCall: () => undefined })

        expect(stopReason).toBe("refusal")
        expect(getEnvironments).not.toHaveBeenCalled()
    })

    it("Given a model that keeps calling tools, when answered, then the loop stops after a bounded number of rounds", async () => {
        getEnvironments.mockResolvedValue([])
        stream.mockImplementation(() => fakeStream({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "toolu_1", name: "list_environments", input: {} }] }))

        const stopReason = await new AssistantService(user, "test-key").chat("project-1", { messages: [{ role: "user", content: "loop" }] }, { onText: () => undefined, onToolCall: () => undefined })

        expect(stopReason).toBe("max_tool_rounds")
        expect(stream).toHaveBeenCalledTimes(8)
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

        await expect(new AssistantService(user, "test-key").draftProject("A portal on AWS, code on GitHub", "en")).resolves.toEqual(draft)
        expect(create.mock.calls[0][0].output_config.format.type).toBe("json_schema")
    })
})
