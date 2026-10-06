import { create } from "zustand"
import { devtools } from "zustand/middleware"

export type AssistantRole = "user" | "assistant"

export interface AssistantMessage {
    id: string
    role: AssistantRole
    content: string
    /** Only assistant messages carry a status: they are written while the answer streams in. */
    status?: "streaming" | "done" | "error"
    /** Translation key under `assistant.errors`, set when the answer could not be completed. */
    errorKey?: string
    /** Tools the assistant called while writing this answer, in order. */
    tools?: string[]
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
    reset: () => void
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
            reset: () => set({ messages: [], pendingQuestion: undefined })
        }),
        {
            name: "assistant-storage"
        }
    )
)

export default useAssistantStore
