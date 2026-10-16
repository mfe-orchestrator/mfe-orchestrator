import { create } from "zustand"
import { devtools } from "zustand/middleware"

export type AssistantRole = "user" | "assistant"

/**
 * What a tool does: reads run freely, writes run directly, `confirm` (grants access or cannot be
 * undone) and `destructive` calls wait for the user.
 */
export type AssistantToolKind = "read" | "write" | "confirm" | "destructive"

export interface AssistantToolCall {
    /** The model's call id: the `tool_result` and the `confirm` of this call refer to it. */
    id: string
    name: string
    title: string
    kind: AssistantToolKind
    input: Record<string, unknown>
    /**
     * `interrupted` when the answer stopped before the call reported back, `declined` when the
     * user cancelled its confirmation card.
     */
    status: "running" | "ok" | "error" | "awaiting_confirmation" | "declined" | "interrupted"
    /** The server's one-line outcome, the error message when the call failed. */
    summary?: string
    /** What the call returned, as the user may see it; a string preview when it was too long. */
    result?: unknown
}

/** One line of a confirmation card, built by the server: `label` is a key under `assistant.confirmation.details`. */
export interface AssistantConfirmationDetail {
    label: string
    value: string
}

/** A call waiting for (or answered by) the user. */
export interface AssistantConfirmation {
    actionId: string
    callId: string
    name: string
    title: string
    input: Record<string, unknown>
    /** What the call acts on, with names instead of ids: what the user checks before confirming. */
    details: AssistantConfirmationDetail[]
    /** ISO date after which the server no longer accepts an answer. */
    expiresAt: string
    status: "pending" | "approved" | "declined" | "expired"
}

export interface AssistantMessage {
    id: string
    role: AssistantRole
    content: string
    /** Only assistant messages carry a status: they are written while the answer streams in. */
    status?: "streaming" | "done" | "error"
    /** Translation key under `assistant.errors`, set when the answer could not be completed. */
    errorKey?: string
    /** Tools the assistant called while writing this answer, in order. */
    tools?: AssistantToolCall[]
    /** Set when the answer stopped to ask the user to confirm a destructive call. */
    confirmation?: AssistantConfirmation
}

interface AssistantState {
    isOpen: boolean
    messages: AssistantMessage[]
    /**
     * A question asked from outside the panel (a ✨ button on a page), waiting for the panel
     * to send it. Kept here rather than sent directly so that only the panel talks to the API.
     */
    pendingQuestion?: string
    open: () => void
    close: () => void
    toggle: () => void
    ask: (question: string) => void
    takePendingQuestion: () => string | undefined
    addMessage: (message: AssistantMessage) => void
    updateMessage: (id: string, update: (message: AssistantMessage) => AssistantMessage) => void
    /**
     * Updates the latest tool call with that id, wherever it is: a confirmed call reports back in the
     * next answer's stream. The latest only, should an id come back in another answer.
     */
    updateTool: (id: string, update: (tool: AssistantToolCall) => AssistantToolCall) => void
    reset: () => void
}

/** `findLastIndex`, which the ES2020 target of the console does not have. */
const lastIndexWhere = <T>(items: T[], predicate: (item: T) => boolean) => {
    for (let index = items.length - 1; index >= 0; index--) {
        if (predicate(items[index])) return index
    }
    return -1
}

const useAssistantStore = create<AssistantState>()(
    devtools(
        (set, get) => ({
            isOpen: false,
            messages: [],
            open: () => set({ isOpen: true }),
            close: () => set({ isOpen: false }),
            toggle: () => set({ isOpen: !get().isOpen }),
            ask: (question: string) => set({ isOpen: true, pendingQuestion: question }),
            takePendingQuestion: () => {
                const question = get().pendingQuestion
                if (question) set({ pendingQuestion: undefined })
                return question
            },
            addMessage: (message: AssistantMessage) => set({ messages: [...get().messages, message] }),
            updateMessage: (id: string, update: (message: AssistantMessage) => AssistantMessage) => set({ messages: get().messages.map(message => (message.id === id ? update(message) : message)) }),
            updateTool: (id: string, update: (tool: AssistantToolCall) => AssistantToolCall) => {
                const messages = get().messages
                const messageIndex = lastIndexWhere(messages, message => Boolean(message.tools?.some(tool => tool.id === id)))
                if (messageIndex < 0) return
                const tools = messages[messageIndex].tools ?? []
                const toolIndex = lastIndexWhere(tools, tool => tool.id === id)
                set({
                    messages: messages.map((message, index) =>
                        index === messageIndex ? { ...message, tools: tools.map((tool, position) => (position === toolIndex ? update(tool) : tool)) } : message
                    )
                })
            },
            reset: () => set({ messages: [], pendingQuestion: undefined })
        }),
        {
            name: "assistant-storage"
        }
    )
)

export default useAssistantStore
