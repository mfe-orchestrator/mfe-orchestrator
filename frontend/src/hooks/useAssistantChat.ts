import { useQueryClient } from "@tanstack/react-query"
import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useLocation } from "react-router-dom"
import useAssistantJobsStore from "@/store/useAssistantJobsStore"
import useAssistantStore, { AssistantRole, AssistantUsage, toStored } from "@/store/useAssistantStore"
import useProjectStore from "@/store/useProjectStore"
import type { LlmEffort } from "@/types/ConfigResponseDTO"
import useAiJobsApi from "./apiClients/useAiJobsApi"
import { AVAILABLE_AI_MODELS_QUERY_KEY } from "./apiClients/useAiModelsApi"
import useAssistantApi from "./apiClients/useAssistantApi"
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

/** Tools that start an agent job: their result carries the `jobId`, and the job gets a tab of its own. */
const JOB_TOOLS = new Set(["ai_job_start", "ai_job_follow_up", "ai_change_start"])

/** Tools that push proposals: the job tabs showing them poll again to follow the apply. */
const APPLY_TOOLS = new Set(["ai_job_apply", "ai_change_apply"])

/** The `jobId` of a tool result, when it is an object that has one (a result too long arrives as a string preview). */
const jobIdOf = (result: unknown): string | undefined => {
    const jobId = typeof result === "object" && result !== null ? (result as { jobId?: unknown }).jobId : undefined
    return typeof jobId === "string" ? jobId : undefined
}

const hasPendingConfirmation = () => useAssistantStore.getState().messages.some(message => message.confirmation?.status === "pending")

/** Saves go one after the other: each one replaces the whole conversation, a slow one landing last would drop what came after it. */
let savesInFlight: Promise<void> = Promise.resolve()

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
 *
 * `effort` and `aiModelId` go with every request; undefined when the AI offers no choice of effort, or while the AIs of
 * the project are not known yet, and the backend applies its default.
 */
const useAssistantChat = (effort?: LlmEffort, aiModelId?: string) => {
    const { getToken } = useApiClient()
    const { i18n } = useTranslation()
    const location = useLocation()
    const projectStore = useProjectStore()
    const queryClient = useQueryClient()
    const { addMessage, updateMessage, updateTool } = useAssistantStore()
    const aiJobsApi = useAiJobsApi()
    const assistantApi = useAssistantApi()
    const [isStreaming, setIsStreaming] = useState(false)
    const abortRef = useRef<AbortController | undefined>(undefined)

    /**
     * Opens the tab of a job the assistant started, without taking the focus from the chat. The
     * result only has the job id: the chain the tab belongs to comes with the job.
     */
    const openJobTab = async (jobId: string, projectId: string) => {
        try {
            const job = await aiJobsApi.get(jobId, { silent: true })
            useAssistantJobsStore.getState().openJob(projectId, job)
        } catch (error) {
            // The answer still says what happened; the tab is a shortcut to it.
            console.error("Could not open the job tab", error)
        }
    }

    /**
     * Saves the conversation as it is now for the history. Nothing else keeps it: a reload starts a
     * new conversation, and the history is where this one is found again.
     *
     * Open, or set aside by a project switch while it streamed: the request carries the project of
     * the render that sent the question, the one the conversation belongs to. Anything else (opened
     * from the history, a new conversation) is not this one any more and is left alone.
     */
    const save = (conversationId: string) => {
        const state = useAssistantStore.getState()
        const parkedOn = Object.keys(state.conversationIds).find(projectId => projectId !== state.projectId && state.conversationIds[projectId] === conversationId)
        const current = state.conversationId === conversationId ? state.messages : parkedOn && state.conversations[parkedOn]
        if (!current) return
        const messages = toStored(current)
        savesInFlight = savesInFlight.then(async () => {
            try {
                await assistantApi.saveConversation(conversationId, messages)
                queryClient.invalidateQueries({ queryKey: ["assistant-conversations"] })
            } catch (error) {
                console.error("Could not save the conversation", error)
            }
        })
    }

    /**
     * Posts `body` and streams the answer into the message `answerId`. `onRefused` runs when the
     * server answers with an HTTP error instead of a stream.
     */
    const stream = async (body: Record<string, unknown>, answerId: string, onRefused?: (status: number) => void) => {
        const abortController = new AbortController()
        abortRef.current = abortController
        setIsStreaming(true)
        // The conversation this answer belongs to: switching project or opening another one swaps it.
        const conversationId = useAssistantStore.getState().conversationId
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
                body: JSON.stringify({ ...body, effort, aiModelId, context: { page: location.pathname, environmentId: projectStore.environment?._id, locale: i18n.language } })
            })

            if (!response.ok || !response.body) {
                onRefused?.(response.status)
                const code = await response.json().then(
                    (data: { error?: { code?: string } }) => data?.error?.code,
                    () => undefined
                )
                if (code === "AI_MODEL_NOT_AVAILABLE") {
                    // Taken away from the project since the list was read: reading it again falls back to the default.
                    queryClient.invalidateQueries({ queryKey: [AVAILABLE_AI_MODELS_QUERY_KEY] })
                    fail("ai_model_not_available")
                } else fail(ERROR_KEY_BY_STATUS[response.status] || "generic")
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
                    } else if (event === "thinking") {
                        updateMessage(answerId, message => ({ ...message, thinking: (message.thinking ?? "") + payload.delta }))
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
                        const jobId = payload.ok && call && JOB_TOOLS.has(call.name) ? jobIdOf(payload.result) : undefined
                        if (jobId && projectStore.project?._id) openJobTab(jobId, projectStore.project._id)
                        if (payload.ok && call && APPLY_TOOLS.has(call.name)) {
                            queryClient.invalidateQueries({ queryKey: ["ai-job-chain"] })
                            queryClient.invalidateQueries({ queryKey: ["ai-job"] })
                        }
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
            // Saved after every answer, so that the history can reopen it.
            if (conversationId) save(conversationId)
        }
    }

    const send = async (question: string) => {
        const trimmed = question.trim()
        // The ref, not the state: two clicks within one render would both still see isStreaming false.
        // A pending confirmation has to be answered first: the turn it belongs to is not over.
        if (!trimmed || abortRef.current || hasPendingConfirmation()) return

        const history = buildHistory(MAX_MESSAGES - 1)
        const answerId = newId()
        const conversationId = useAssistantStore.getState().ensureConversationId()
        addMessage({ id: newId(), role: "user", content: trimmed })
        addMessage({ id: answerId, role: "assistant", content: "", status: "streaming", tools: [], effort })
        // Saved with the question too: a reload during the answer would otherwise lose the turn, and a first question its conversation.
        save(conversationId)

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
        addMessage({ id: answerId, role: "assistant", content: "", status: "streaming", tools: [], effort })
        // The server takes the answer at once: reopened after a reload, the card must not ask again.
        const conversationId = useAssistantStore.getState().conversationId
        if (conversationId) save(conversationId)

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
