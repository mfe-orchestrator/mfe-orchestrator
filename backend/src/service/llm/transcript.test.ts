import { describe, expect, it } from "vitest"
import { compactTranscript, TRANSCRIPT_LIMITS } from "./transcript"
import { LlmMessage } from "./types"

const call = (id: string, input: Record<string, unknown>) => ({ id, name: "write_file", input })

describe("compactTranscript", () => {
    it("Given provider turns with long contents, when compacted, then native is dropped, contents are cut and calls stay paired with their results", () => {
        const messages: LlmMessage[] = [
            { role: "user", text: "Add a page" },
            { role: "assistant", text: "", toolCalls: [call("1", { path: "a.ts", content: "x".repeat(5_000) })], native: [{ type: "thinking", signature: "s" }] },
            { role: "tool", results: [{ callId: "1", name: "write_file", content: "y".repeat(5_000) }] },
            { role: "assistant", text: "Done.", toolCalls: [] }
        ]

        const compacted = compactTranscript(messages, "unused")

        expect(compacted).toHaveLength(4)
        const assistant = compacted[1] as Extract<LlmMessage, { role: "assistant" }>
        expect(assistant.native).toBeUndefined()
        expect(assistant.toolCalls[0].id).toBe("1")
        expect(String(assistant.toolCalls[0].input.content).length).toBeLessThan(TRANSCRIPT_LIMITS.maxToolText + 100)
        const tool = compacted[2] as Extract<LlmMessage, { role: "tool" }>
        expect(tool.results[0]).toEqual({ callId: "1", name: "write_file", content: expect.stringContaining("cut: 3000 more characters") })
    })

    it("Given a run that ended on tool results, when compacted, then the closing words end it", () => {
        const compacted = compactTranscript(
            [
                { role: "user", text: "Add a page" },
                { role: "assistant", text: "", toolCalls: [{ id: "1", name: "finish", input: { summary: "Added" } }] },
                { role: "tool", results: [{ callId: "1", name: "finish", content: "Done." }] }
            ],
            "Added"
        )

        expect(compacted.at(-1)).toEqual({ role: "assistant", text: "Added", toolCalls: [] })
    })

    it("Given a last turn whose calls never ran, when compacted, then its calls are dropped", () => {
        const compacted = compactTranscript(
            [
                { role: "user", text: "Add a page" },
                { role: "assistant", text: "", toolCalls: [call("1", { path: "a.ts" })] }
            ],
            "Stopped"
        )

        expect(compacted).toEqual([
            { role: "user", text: "Add a page" },
            { role: "assistant", text: "Stopped", toolCalls: [] }
        ])
    })

    it("Given a conversation over the budget, when compacted, then the oldest tool exchanges lose their content first", () => {
        const exchange = (id: string): LlmMessage[] => [
            { role: "assistant", text: "", toolCalls: [{ id, name: "read_file", input: { path: `${id}.ts` } }] },
            { role: "tool", results: [{ callId: id, name: "read_file", content: "z".repeat(TRANSCRIPT_LIMITS.maxToolText) }] }
        ]
        const count = Math.ceil(TRANSCRIPT_LIMITS.maxTotal / TRANSCRIPT_LIMITS.maxToolText) + 10
        const messages: LlmMessage[] = [
            { role: "user", text: "Read everything" },
            ...Array.from({ length: count }, (_, index) => exchange(String(index))).flat(),
            { role: "assistant", text: "Read.", toolCalls: [] }
        ]

        const compacted = compactTranscript(messages, "unused")

        expect(JSON.stringify(compacted).length).toBeLessThanOrEqual(TRANSCRIPT_LIMITS.maxTotal)
        expect((compacted[2] as Extract<LlmMessage, { role: "tool" }>).results[0].content).toContain("left out of the history")
        expect((compacted.at(-2) as Extract<LlmMessage, { role: "tool" }>).results[0].content).toBe("z".repeat(TRANSCRIPT_LIMITS.maxToolText))
    })
})
