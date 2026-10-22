import { useQuery } from "@tanstack/react-query"
import useAiModelsApi, { AiModelSummary, AVAILABLE_AI_MODELS_QUERY_KEY, effortsOf } from "@/hooks/apiClients/useAiModelsApi"
import useAiModelStore from "@/store/useAiModelStore"
import useProjectStore from "@/store/useProjectStore"
import type { LlmEffort } from "@/types/ConfigResponseDTO"

const NO_MODELS: AiModelSummary[] = []

export interface ProjectAiModels {
    /** The AI features exist in the project only when it can use at least one AI (see docs/AI-PROVIDERS.md). */
    enabled: boolean
    /** True until the project's AIs are known: a page that turns the user away without them waits for it. */
    isPending: boolean
    models: AiModelSummary[]
    /** The AI picked in the project, else its default: undefined only when there is none. */
    selected?: AiModelSummary
    /** The effort levels of the selected AI, lowest first: empty when it offers no choice. */
    efforts: LlmEffort[]
    setSelected: (aiModelId: string) => void
}

/** The AIs the open project can use, and the one picked in it: every AI request of the project sends its id. */
const useProjectAiModels = (): ProjectAiModels => {
    const projectId = useProjectStore(state => state.project?._id)
    const aiModelsApi = useAiModelsApi()
    const stored = useAiModelStore(state => (projectId ? state.byProject[projectId] : undefined))
    const setAiModel = useAiModelStore(state => state.setAiModel)

    const query = useQuery({
        queryKey: [AVAILABLE_AI_MODELS_QUERY_KEY, "project", projectId],
        queryFn: () => aiModelsApi.available({ silent: true }),
        enabled: Boolean(projectId),
        staleTime: 60_000
    })

    const models = query.data?.models ?? NO_MODELS
    // A pick that is no longer available (removed, or taken away from the project) gives way to the default.
    const selected = models.find(model => model.id === stored) ?? models.find(model => model.id === query.data?.defaultId) ?? models[0]

    return {
        enabled: models.length > 0,
        isPending: Boolean(projectId) && query.isPending,
        models,
        selected,
        efforts: effortsOf(selected),
        setSelected: aiModelId => {
            if (projectId) setAiModel(projectId, aiModelId)
        }
    }
}

export default useProjectAiModels
