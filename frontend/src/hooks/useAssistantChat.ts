import { useQueryClient } from "@tanstack/react-query"
import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useLocation } from "react-router-dom"
import useAssistantStore, { AssistantRole, AssistantUsage } from "@/store/useAssistantStore"
import useProjectStore from "@/store/useProjectStore"
import useApiClient from "./useApiClient"
import { drainFrames, parseFrame } from "./useEventStream"

/** Mirrors the backend bounds: the whole conversation travels with every question. */
const MAX_MESSAGES = 40
const MAX_MESSAGE_CHARS = 8_000

// Only needs to be unique within the open conversation; crypto.randomUUID would also need a secure context.
let messageCounter = 0
const newId = () => `message-${Date.now()}-${messageCounter++}`

/** 409: the confirmation was already answered, or expired, before this answer reached the server. */
const ERROR_KEY_BY_STATUS: Record<number, string> = { 404: "disabled", 409: "confirmation_expired", 429: "rate_limited" }

/** The `usage` of a `done` frame, or nothing from a backend that does not send it yet. */
const toUsage = (value: unknown): AssistantUsage | undefined => {
    const usage = value as Partial<AssistantUsage> | undefined
    if (typeof usage?.inputTokens !== "number" || typeof usage.outputTokens !== "number") return undefined
    return { inputTokens: usage.inputTokens, cachedInputTokens: usage.cachedInputTokens ?? 0, outputTokens: usage.outputTokens }
}

const hasPendingConfirmation = () => useAssistantStore.getState().messages.some(message => message.confirmation?.status === "pending")

/**
 * The conversation as the model sees it: plain text, failed answers dropped (they carry no
 * content, only an error), at most `limit` messages, opening with the user.
 */
const buildHistory = (limit: number) => {
    const history: { role: AssistantRole; content: string }[] = []
    for (const message of useAssistantStore.getState().messages) {
        if (message.status === "error" || !message.content) continue
        const content = message.content.slice(0, MAX_MESSAGE_CHARS)
        const previous = history[history.length - 1]
        // A turn that stopped for a confirmation goes on in a new bubble, but it is still one answer.
        if (previous?.role === "assistant" && message.role === "assistant") previous.content = `${previous.content}\n\n${content}`.slice(0, MAX_MESSAGE_CHARS)
        else history.push({ role: message.role, content })
    }
    const trimmed = history.slice(-limit)
    // Trimming can leave an answer first; a conversation has to open with the user.
    while (trimmed[0]?.role === "assistant") trimmed.shift()
    return trimmed
}

/**
 * Sends questions to the console assistant and streams the answers into the assistant store.
 *
 * The answer arrives as Server-Sent Events over a POST, so it is read with fetch like the
 * build status stream: EventSource can neither POST nor carry the Authorization header.
 * The frames are described in `backend/src/service/assistant/assistantActions.ts`.
 */
const useAssistantChat = () => {
    const { getToken } = useApiClient()
    const { i18n } = useTranslation()
    const location = useLocation()
    const projectStore = useProjectStore()
    const queryClient = useQueryClient()
    const { addMessage, updateMessage, updateTool } = useAssistantStore()
    const [isStreaming, setIsStreaming] = useState(false)
    const abortRef = useRef<AbortController | undefined>(undefined)

    /**
     * Posts `body` and streams the answer into the message `answerId`. `onRefused` runs when the
     * server answers with an HTTP error instead of a stream.
     */
    const stream = async (body: Record<string, unknown>, answerId: string, onRefused?: (status: number) => void) => {
        const abortController = new AbortController()
        abortRef.current = abortController
        setIsStreaming(true)
        // Whether the page behind the panel may now show stale data.
        let wrote = false

        const fail = (errorKey: string) => updateMessage(answerId, message => ({ ...message, status: "error", errorKey }))

        try {
            const token = await getToken()
            const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "text/event-stream" }
            if (token?.token) headers.Authorization = `Bearer ${token.token}`
            if (token?.issuer) headers.issuer = token.issuer
            if (projectStore.project?._id) headers["Project-Id"] = projectStore.project._id

            const response = await fetch("/api/assistant/chat", {
                method: "POST",
                headers,
                signal: abortController.signal,
                cache: "no-store",
                body: JSON.stringify({ ...body, context: { page: location.pathname, environmentId: projectStore.environment?._id, locale: i18n.language } })
            })

            if (!response.ok || !response.body) {
                onRefused?.(response.status)
                fail(ERROR_KEY_BY_STATUS[response.status] || "generic")
                return
            }

            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ""
            let finished = false

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                buffer = drainFrames(buffer + decoder.decode(value, { stream: true }), frame => {
                    const { event, data } = parseFrame(frame)
                    if (!data) return
                    const payload = JSON.parse(data)

                    if (event === "text") {
                        updateMessage(answerId, message => ({ ...message, content: message.content + payload.delta }))
                    } else if (event === "tool_call") {
                        const { id, name, title, kind, input } = payload
                        updateMessage(answerId, message => ({ ...message, tools: [...(message.tools || []), { id, name, title: title || name, kind, input: input ?? {}, status: "running" }] }))
                    } else if (event === "tool_result") {
                        // The latest call with that id, the one updateTool changes.
                        const call = useAssistantStore
                            .getState()
                            .messages.flatMap(message => message.tools || [])
                            .reverse()
                            .find(tool => tool.id === payload.id)
                        if (payload.ok && call && call.kind !== "read") wrote = true
                        updateTool(payload.id, tool => ({
                            ...tool,
                            // A declined call reports back as failed; for the user it was a choice, not an error.
                            status: tool.status === "declined" ? "declined" : payload.ok ? "ok" : "error",
                            summary: payload.summary,
                            result: payload.result
                        }))
                    } else if (event === "confirm") {
                        const { actionId, callId, name, title, input, details, expiresAt } = payload
                        updateMessage(answerId, message => ({
                            ...message,
                            confirmation: { actionId, callId, name, title: title || name, input: input ?? {}, details: Array.isArray(details) ? details : [], expiresAt, status: "pending" }
                        }))
                        updateTool(callId, tool => ({ ...tool, status: "awaiting_confirmation" }))
                    } else if (event === "done") {
                        finished = true
                        if (payload.wrote) wrote = true
                        const usage = toUsage(payload.usage)
                        if (usage) updateMessage(answerId, message => ({ ...message, usage }))
                        if (payload.stopReason === "refusal") fail("refusal")
                        else if (payload.stopReason === "end_turn" || payload.stopReason === "awaiting_confirmation") updateMessage(answerId, message => ({ ...message, status: "done" }))
                        else updateMessage(answerId, message => ({ ...message, status: "done", errorKey: "incomplete" }))
                    } else if (event === "error") {
                        finished = true
                        fail(payload.code === "RATE_LIMITED" ? "rate_limited" : "generic")
                    }
                })
            }

            if (!finished) fail("generic")
        } catch (error) {
            if (abortController.signal.aborted) {
                updateMessage(answerId, message => ({ ...message, status: "done", errorKey: "stopped" }))
            } else {
                console.error("Assistant request failed", error)
                fail("generic")
            }
        } finally {
            // A call that never reported back must not spin forever; a confirmed one sits in the previous answer.
            useAssistantStore.setState(state => ({
                messages: state.messages.map(message =>
                    message.tools?.some(tool => tool.status === "running")
                        ? { ...message, tools: message.tools.map(tool => (tool.status === "running" ? { ...tool, status: "interrupted" } : tool)) }
                        : message
                )
            }))
            abortRef.current = undefined
            setIsStreaming(false)
            if (wrote) queryClient.invalidateQueries()
        }
    }

    const send = async (question: string) => {
        const trimmed = question.trim()
        // The ref, not the state: two clicks within one render would both still see isStreaming false.
        // A pending confirmation has to be answered first: the turn it belongs to is not over.
        if (!trimmed || abortRef.current || hasPendingConfirmation()) return

        const history = buildHistory(MAX_MESSAGES - 1)
        const answerId = newId()
        addMessage({ id: newId(), role: "user", content: trimmed })
        addMessage({ id: answerId, role: "assistant", content: "", status: "streaming", tools: [] })

        await stream({ messages: [...history, { role: "user", content: trimmed.slice(0, MAX_MESSAGE_CHARS) }] }, answerId)
    }

    /**
     * Answers the pending confirmation card. Either way the turn goes on in a new answer: the
     * model hears the outcome (or that the user declined) and carries on from there.
     */
    const answerConfirmation = async (approved: boolean) => {
        if (abortRef.current) return
        const asking = useAssistantStore.getState().messages.find(message => message.confirmation?.status === "pending")
        const confirmation = asking?.confirmation
        if (!asking || !confirmation) return

        const history = buildHistory(MAX_MESSAGES)
        const setStatus = (status: "pending" | "approved" | "declined" | "expired") =>
            updateMessage(asking.id, message => (message.confirmation ? { ...message, confirmation: { ...message.confirmation, status } } : message))

        setStatus(approved ? "approved" : "declined")
        updateTool(confirmation.callId, tool => ({ ...tool, status: approved ? "running" : "declined" }))

        const answerId = newId()
        addMessage({ id: answerId, role: "assistant", content: "", status: "streaming", tools: [] })

        await stream({ messages: history, confirmation: { actionId: confirmation.actionId, approved } }, answerId, status => {
            // The server took nothing unless it says the action is gone: the card can be answered again.
            const expired = status === 409
            setStatus(expired ? "expired" : "pending")
            updateTool(confirmation.callId, tool => ({ ...tool, status: expired ? "interrupted" : "awaiting_confirmation" }))
        })
    }

    const stop = () => abortRef.current?.abort()

    return { send, answerConfirmation, stop, isStreaming }
}

export default useAssistantChat
