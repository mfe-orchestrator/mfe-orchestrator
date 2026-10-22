import { create } from "zustand"
import { createJSONStorage, devtools, persist, StateStorage } from "zustand/middleware"
import type { LlmEffort } from "@/types/ConfigResponseDTO"

/** Where the effort is picked: the assistant and Code with AI each remember their own choice. */
export type EffortSurface = "assistant" | "code"

/** localStorage when the browser allows it (not in private mode or a sandboxed frame): otherwise the choice lasts the session, in memory. */
export const safeLocalStorage: StateStorage = {
    getItem: name => {
        try {
            return localStorage.getItem(name)
        } catch {
            return null
        }
    },
    setItem: (name, value) => {
        try {
            localStorage.setItem(name, value)
        } catch {
            // Not remembered: the store still holds it.
        }
    },
    removeItem: name => {
        try {
            localStorage.removeItem(name)
        } catch {
            // Nothing was stored.
        }
    }
}

/** The level last picked on each surface, as picked: clamped to the levels the provider offers when read. */
interface AiEffortState extends Record<EffortSurface, LlmEffort> {
    setEffort: (surface: EffortSurface, effort: LlmEffort) => void
}

/** One choice per surface, shared by every selector of it: a dialog started from a composer sends what the composer shows. */
const useAiEffortStore = create<AiEffortState>()(
    devtools(
        persist(
            set => ({
                // The backend's defaults: a chat answer wants to be quick, a change to the code thorough.
                assistant: "medium",
                code: "high",
                setEffort: (surface, effort) => set({ [surface]: effort })
            }),
            {
                name: "ai-effort",
                storage: createJSONStorage(() => safeLocalStorage),
                partialize: state => ({ assistant: state.assistant, code: state.code })
            }
        ),
        {
            name: "ai-effort-storage"
        }
    )
)

export default useAiEffortStore
