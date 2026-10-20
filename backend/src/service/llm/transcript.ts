import { LlmMessage, LlmToolCall } from "./types"

/**
 * A conversation with an agent, kept between two messages of the user so the next one carries on
 * from it: what the model said, the tools it called and what they answered.
 *
 * Kept small: file contents read or written are cut, the provider's own form of each turn
 * (`native`) is dropped (thinking blocks and signatures only matter within the turn that made them),
 * and past a budget the oldest tool exchanges lose their content altogether. The calls and the
 * results stay paired, which every provider requires.
 */

export const TRANSCRIPT_LIMITS = {
    /** Characters kept of a tool result or of a string argument of a call. */
    maxToolText: 2_000,
    /** Characters kept of what the model or the user wrote. */
    maxText: 16_000,
    /** Characters of the whole transcript, as JSON: past it the oldest tool exchanges are emptied. */
    maxTotal: 400_000
}

const OMITTED = "(left out of the history: run the tool again if you need it)"

const clip = (value: string, max: number) => (value.length > max ? `${value.slice(0, max)}\n… cut: ${value.length - max} more characters` : value)

const clipInput = (input: Record<string, unknown>, max: number): Record<string, unknown> =>
    Object.fromEntries(Object.entries(input).map(([key, value]) => [key, typeof value === "string" ? clip(value, max) : value]))

const compactCall = (call: LlmToolCall, max: number): LlmToolCall => ({ id: call.id, name: call.name, input: clipInput(call.input, max) })

const compactMessage = (message: LlmMessage): LlmMessage => {
    switch (message.role) {
        case "user":
            return { role: "user", text: clip(message.text, TRANSCRIPT_LIMITS.maxText) }
        case "assistant":
            return { role: "assistant", text: clip(message.text, TRANSCRIPT_LIMITS.maxText), toolCalls: message.toolCalls.map(call => compactCall(call, TRANSCRIPT_LIMITS.maxToolText)) }
        case "tool":
            return {
                role: "tool",
                results: message.results.map(result => ({
                    callId: result.callId,
                    name: result.name,
                    content: clip(result.content, TRANSCRIPT_LIMITS.maxToolText),
                    ...(result.isError ? { isError: true } : {})
                }))
            }
    }
}

/** A tool exchange with nothing left of what was read or written: only which tools ran. */
const emptied = (message: LlmMessage): LlmMessage => {
    if (message.role === "tool") return { role: "tool", results: message.results.map(result => ({ ...result, content: OMITTED })) }
    if (message.role === "assistant") return { ...message, toolCalls: message.toolCalls.map(call => compactCall(call, 200)) }
    return message
}

const sizeOf = (message: LlmMessage) => JSON.stringify(message).length

/**
 * The conversation as it is stored. It always ends with the model speaking without calling tools,
 * so the next message of the user can follow it directly: a run that ended on tool results, or
 * without a word, gets `closing` as the model's last words.
 */
export const compactTranscript = (messages: LlmMessage[], closing: string): LlmMessage[] => {
    const compacted = messages.map(compactMessage)
    const last = compacted.at(-1)
    // A call left without its result (a turn cut off) cannot go back to any provider.
    if (last?.role === "assistant" && last.toolCalls.length) compacted[compacted.length - 1] = { ...last, toolCalls: [] }
    const final = compacted.at(-1)
    if (final?.role !== "assistant") compacted.push({ role: "assistant", text: clip(closing, TRANSCRIPT_LIMITS.maxText), toolCalls: [] })
    else if (!final.text.trim()) compacted[compacted.length - 1] = { ...final, text: clip(closing, TRANSCRIPT_LIMITS.maxText) }

    // The oldest exchanges go first: the latest ones are what the next message most likely refers to.
    const sizes = compacted.map(sizeOf)
    let total = sizes.reduce((sum, size) => sum + size, 0)
    for (let index = 0; index < compacted.length && total > TRANSCRIPT_LIMITS.maxTotal; index++) {
        compacted[index] = emptied(compacted[index])
        const size = sizeOf(compacted[index])
        total += size - sizes[index]
        sizes[index] = size
    }
    return compacted
}
