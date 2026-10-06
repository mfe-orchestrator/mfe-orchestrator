import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useLocation } from "react-router-dom"
import useAssistantStore from "@/store/useAssistantStore"
import useProjectStore from "@/store/useProjectStore"
import useApiClient from "./useApiClient"
import { drainFrames, parseFrame } from "./useEventStream"

/** Mirrors the backend bounds: the whole conversation travels with every question. */
const MAX_MESSAGES = 40
const MAX_MESSAGE_CHARS = 8_000

// Only needs to be unique within the open conversation; crypto.randomUUID would also need a secure context.
let messageCounter = 0
const newId = () => `message-${Date.now()}-${messageCounter++}`

const ERROR_KEY_BY_STATUS: Record<number, string> = { 404: "disabled", 429: "rate_limited" }

/**
 * Sends questions to the console assistant and streams the answers into the assistant store.
 *
 * The answer arrives as Server-Sent Events over a POST, so it is read with fetch like the
 * build status stream: EventSource can neither POST nor carry the Authorization header.
 */
const useAssistantChat = () => {
    const { getToken } = useApiClient()
    const { i18n } = useTranslation()
    const location = useLocation()
    const projectStore = useProjectStore()
    const { addMessage, updateMessage } = useAssistantStore()
    const [isStreaming, setIsStreaming] = useState(false)
    const abortRef = useRef<AbortController | undefined>(undefined)

    const send = async (question: string) => {
        const trimmed = question.trim()
        // The ref, not the state: two clicks within one render would both still see isStreaming false.
        if (!trimmed || abortRef.current) return

        // Failed answers are dropped from what the model sees: they carry no content, only an error.
        const history = useAssistantStore
            .getState()
            .messages.filter(message => message.status !== "error" && message.content)
            .map(message => ({ role: message.role, content: message.content.slice(0, MAX_MESSAGE_CHARS) }))
            .slice(-(MAX_MESSAGES - 1))
        // Trimming can leave an answer first; a conversation has to open with the user.
        while (history[0]?.role === "assistant") history.shift()

        const abortController = new AbortController()
        abortRef.current = abortController
        setIsStreaming(true)

        const answerId = newId()
        addMessage({ id: newId(), role: "user", content: trimmed })
        addMessage({ id: answerId, role: "assistant", content: "", status: "streaming", tools: [] })

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
                body: JSON.stringify({
                    messages: [...history, { role: "user", content: trimmed.slice(0, MAX_MESSAGE_CHARS) }],
                    context: { page: location.pathname, environmentId: projectStore.environment?._id, locale: i18n.language }
                })
            })

            if (!response.ok || !response.body) {
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
                    } else if (event === "tool") {
                        updateMessage(answerId, message => ({ ...message, tools: [...(message.tools || []), payload.name] }))
                    } else if (event === "done") {
                        finished = true
                        if (payload.stopReason === "refusal") fail("refusal")
                        else if (payload.stopReason !== "end_turn") updateMessage(answerId, message => ({ ...message, status: "done", errorKey: "incomplete" }))
                        else updateMessage(answerId, message => ({ ...message, status: "done" }))
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
            abortRef.current = undefined
            setIsStreaming(false)
        }
    }

    const stop = () => abortRef.current?.abort()

    return { send, stop, isStreaming }
}

export default useAssistantChat
