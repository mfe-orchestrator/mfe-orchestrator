import { isRateLimitError } from "./index"
import { addUsage, LlmClient, LlmEffort, LlmMessage, LlmTool, LlmToolCall, LlmToolResult, LlmTurnRequest, LlmTurnResult, LlmUsage, NO_USAGE } from "./types"

/**
 * The loop every agent of the console runs: a model turn, the tools it called, their results back,
 * until the model answers without calling any. What differs between the assistant and the coding
 * agent is only what goes in (system prompt, tools, history) and what the tools do.
 */

export type AgentLoopStopReason =
    /** The model answered without calling a tool. */
    | "end_turn"
    | "refusal"
    /** The answer was cut off: the tool calls of that turn are never run, a truncated input can still parse. */
    | "max_tokens"
    | "max_rounds"
    /** The tools asked to stop: the work is finished, or waits for the user. */
    | "stopped"

export interface AgentToolsOutcome {
    results: LlmToolResult[]
    /** Ends the loop once the results are in the conversation. */
    stop?: boolean
}

export interface AgentLoopOptions {
    client: LlmClient
    system: string
    tools: LlmTool[]
    /** The conversation so far, ending with the user's message. Every turn and tool result is appended to it. */
    messages: LlmMessage[]
    maxRounds: number
    maxTokens: number
    effort: LlmEffort
    signal?: AbortSignal
    /** Runs the calls of one turn: their results go back together, or the model learns to stop calling tools in parallel. */
    runTools: (calls: LlmToolCall[]) => Promise<AgentToolsOutcome>
    /** Each piece of visible text as it is generated, with the round it belongs to. */
    onText?: (delta: string, round: number) => void
    /** Each piece of the reasoning summary as it is generated, with the round it belongs to. */
    onThinking?: (delta: string, round: number) => void
    /** Every turn the model answered, before its tools run. */
    onTurn?: (result: LlmTurnResult) => Promise<void> | void
    /** Waits before each retry of a rate-limited turn; none retries nothing. */
    rateLimitWaitsMs?: number[]
    onRateLimited?: () => Promise<void> | void
}

export interface AgentLoopResult {
    stopReason: AgentLoopStopReason
    /** The text of the last turn: the answer, when the model ended the turn on its own. */
    text: string
    usage: LlmUsage
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * One turn, sent again while the provider rate-limits it. A long run sends its whole conversation
 * every few seconds and can run into the per-minute token quota: waiting is cheaper than losing
 * minutes of work.
 */
const turnRetryingRateLimits = async (options: AgentLoopOptions, request: LlmTurnRequest): Promise<LlmTurnResult> => {
    for (let attempt = 0; ; attempt++) {
        try {
            return await options.client.turn(request)
        } catch (error) {
            const wait = options.rateLimitWaitsMs?.[attempt]
            if (wait === undefined || !isRateLimitError(error)) throw error
            await options.onRateLimited?.()
            await sleep(wait)
        }
    }
}

export const runAgentLoop = async (options: AgentLoopOptions): Promise<AgentLoopResult> => {
    const { messages, signal } = options
    let usage = NO_USAGE
    for (let round = 0; round < options.maxRounds; round++) {
        // Checked here too: a provider may not stop on its own between two turns.
        signal?.throwIfAborted()
        const result = await turnRetryingRateLimits(options, {
            system: options.system,
            tools: options.tools,
            messages,
            maxTokens: options.maxTokens,
            effort: options.effort,
            signal,
            onText: options.onText && (delta => options.onText!(delta, round)),
            onThinking: options.onThinking && (delta => options.onThinking!(delta, round))
        })
        usage = addUsage(usage, result.usage)
        await options.onTurn?.(result)

        if (result.stopReason === "refusal") return { stopReason: "refusal", text: result.text, usage }
        // A tool input cut off by max_tokens can still look like a valid object: never run it.
        if (result.stopReason === "max_tokens") {
            if (result.text) messages.push({ role: "assistant", text: result.text, toolCalls: [] })
            return { stopReason: "max_tokens", text: result.text, usage }
        }
        messages.push(result.message)
        if (result.toolCalls.length === 0) return { stopReason: "end_turn", text: result.text, usage }

        const outcome = await options.runTools(result.toolCalls)
        messages.push({ role: "tool", results: outcome.results })
        if (outcome.stop) return { stopReason: "stopped", text: result.text, usage }
    }
    return { stopReason: "max_rounds", text: "", usage }
}

/** The calls of one turn, one at a time in the order the model made them, each failure reported back as its result. */
export const runToolsInOrder = async (calls: LlmToolCall[], run: (call: LlmToolCall) => Promise<string>): Promise<LlmToolResult[]> => {
    const results: LlmToolResult[] = []
    for (const call of calls) {
        try {
            results.push({ callId: call.id, name: call.name, content: await run(call) })
        } catch (error) {
            results.push({ callId: call.id, name: call.name, isError: true, content: error instanceof Error ? error.message : String(error) })
        }
    }
    return results
}
