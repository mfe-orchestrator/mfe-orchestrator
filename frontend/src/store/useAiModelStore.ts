import { create } from "zustand"
import { createJSONStorage, devtools, persist } from "zustand/middleware"
import { safeLocalStorage } from "./useAiEffortStore"

/** The AI last picked in each project, as picked: one no longer available to the project gives way to its default when read. */
interface AiModelState {
    byProject: Record<string, string>
    setAiModel: (projectId: string, aiModelId: string) => void
}

/** One choice per project, shared by every selector in it: a dialog started from a composer sends what the composer shows. */
const useAiModelStore = create<AiModelState>()(
    devtools(
        persist(
            set => ({
                byProject: {},
                setAiModel: (projectId, aiModelId) => set(state => ({ byProject: { ...state.byProject, [projectId]: aiModelId } }))
            }),
            {
                name: "ai-model",
                storage: createJSONStorage(() => safeLocalStorage),
                partialize: state => ({ byProject: state.byProject })
            }
        ),
        {
            name: "ai-model-storage"
        }
    )
)

export default useAiModelStore
