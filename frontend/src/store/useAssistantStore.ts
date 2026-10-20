import { create } from "zustand"
import { devtools } from "zustand/middleware"
import type { LlmEffort } from "@/types/ConfigResponseDTO"

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
    /** Tokens the answer cost, every model round summed; set when it finished. */
    usage?: AssistantUsage
    /** The reasoning effort the answer was asked with; missing when the provider offers no choice. */
    effort?: LlmEffort
    /** The summary of the model's reasoning, streamed before and between the rounds of the answer. */
    thinking?: string
}

export interface AssistantUsage {
    /** The whole prompt, the cached part included. */
    inputTokens: number
    /** The part of the prompt read from the provider's cache, billed at a fraction of the price. */
    cachedInputTokens: number
    outputTokens: number
}

interface AssistantState {
    isOpen: boolean
    /** The conversation of the project open in the console. */
    messages: AssistantMessage[]
    /** The project `messages` belong to. */
    projectId?: string
    /** The id `messages` are saved under on the server, set with the first question. */
    conversationId?: string
    /**
     * The conversations of the other projects, kept so that coming back to a project resumes it.
     * In memory only: opening the console starts a new conversation, the history reopens the others.
     */
    conversations: Record<string, AssistantMessage[]>
    /** The ids of the conversations in `conversations`, by project. */
    conversationIds: Record<string, string>
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
    /**
     * Shows the conversation of another project, keeping the current one for when the user comes
     * back. Returns whether the project actually changed.
     */
    switchProject: (projectId: string | undefined) => boolean
    /** Starts a new conversation on the current project; the one left stays in the history. */
    reset: () => void
    /** The id of the open conversation, created when it has none yet. */
    ensureConversationId: () => string
    /**
     * Shows a conversation of the history in place of the open one. Ignored, returning false, when
     * the project changed while it loaded or an answer is streaming: it would land in the wrong place.
     */
    openConversation: (projectId: string, conversationId: string, messages: AssistantMessage[]) => boolean
    /** Forgets every conversation: on logout, so the next user of the browser does not see them. */
    clearAll: () => void
}

/** Saved per conversation; the server reads at most this many messages anyway. */
const MAX_STORED_MESSAGES = 40

/**
 * What the history keeps of a conversation. Tool inputs and results stay in memory only: they can
 * carry variable values or the key of an API key just created, which must not be stored. An answer
 * still streaming reads as stopped (the save at its end replaces it, unless a reload cut it), with
 * its unfinished calls marked interrupted.
 */
export const toStored = (messages: AssistantMessage[]): AssistantMessage[] =>
    messages.slice(-MAX_STORED_MESSAGES).map(message => ({
        ...message,
        status: message.status === "streaming" ? "done" : message.status,
        errorKey: message.status === "streaming" ? (message.errorKey ?? "stopped") : message.errorKey,
        tools: message.tools?.map(({ result: _result, ...tool }) => ({ ...tool, input: {}, status: tool.status === "running" ? "interrupted" : tool.status })),
        confirmation: message.confirmation && { ...message.confirmation, input: {} }
    }))

/**
 * A conversation set aside mid-answer, as the stop would leave it: the stream only ever updates the
 * open conversation, so its answer would otherwise stay streaming and lock the history. A confirmed
 * call runs in the answer before: every running call is interrupted.
 */
const settled = (messages: AssistantMessage[]): AssistantMessage[] =>
    messages.map(message => {
        const tools: AssistantToolCall[] | undefined = message.tools?.map(tool => (tool.status === "running" ? { ...tool, status: "interrupted" } : tool))
        return message.status === "streaming" ? { ...message, status: "done", errorKey: "stopped", tools } : { ...message, tools }
    })

// Only needs to be unique; crypto.randomUUID would also need a secure context. Matches the server's id pattern.
const newConversationId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`

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
            conversations: {},
            conversationIds: {},
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
            switchProject: (projectId: string | undefined) => {
                const state = get()
                if (state.projectId === projectId) return false
                const conversations = { ...state.conversations }
                const conversationIds = { ...state.conversationIds }
                if (state.projectId) {
                    conversations[state.projectId] = settled(state.messages)
                    if (state.conversationId) conversationIds[state.projectId] = state.conversationId
                }
                set({
                    projectId,
                    conversations,
                    conversationIds,
                    messages: (projectId && conversations[projectId]) || [],
                    conversationId: projectId ? conversationIds[projectId] : undefined,
                    pendingQuestion: undefined
                })
                return true
            },
            reset: () => {
                const { projectId, conversations, conversationIds } = get()
                const { [projectId ?? ""]: _dropped, ...others } = conversations
                const { [projectId ?? ""]: _droppedId, ...otherIds } = conversationIds
                set({ messages: [], conversations: others, conversationIds: otherIds, conversationId: undefined, pendingQuestion: undefined })
            },
            ensureConversationId: () => {
                const current = get().conversationId
                if (current) return current
                const conversationId = newConversationId()
                set({ conversationId })
                return conversationId
            },
            openConversation: (projectId: string, conversationId: string, messages: AssistantMessage[]) => {
                const state = get()
                if (state.projectId !== projectId || state.messages.some(message => message.status === "streaming")) return false
                set({ conversationId, messages })
                return true
            },
            clearAll: () => set({ messages: [], conversations: {}, conversationIds: {}, conversationId: undefined, projectId: undefined, pendingQuestion: undefined })
        }),
        {
            name: "assistant-storage"
        }
    )
)

export default useAssistantStore
