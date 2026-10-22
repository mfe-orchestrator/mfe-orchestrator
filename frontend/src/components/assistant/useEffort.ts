import { useState } from "react"
import type { AiJob } from "@/hooks/apiClients/useAiJobsApi"
import { AiModelSummary, effortsOf } from "@/hooks/apiClients/useAiModelsApi"
import useAiEffortStore, { EffortSurface } from "@/store/useAiEffortStore"
import { LLM_EFFORTS, LlmEffort } from "@/types/ConfigResponseDTO"
import useProjectAiModels from "./useProjectAiModels"

/** `wanted`, else the closest level below it the AI offers, else its lowest: never more than asked when it can be helped. */
const clamp = (wanted: LlmEffort, available: LlmEffort[]): LlmEffort | undefined => {
    if (available.includes(wanted)) return wanted
    const rank = LLM_EFFORTS.indexOf(wanted)
    return [...available].reverse().find(level => LLM_EFFORTS.indexOf(level) < rank) ?? available[0]
}

/**
 * The effort picked on `surface`, shared by every selector of it and remembered across visits, within the levels of
 * the AI picked in the project. Undefined when that AI offers no choice: nothing is sent then, and the backend applies
 * its default.
 */
export const useEffort = (surface: EffortSurface): [LlmEffort | undefined, (effort: LlmEffort) => void] => {
    const { efforts } = useProjectAiModels()
    const wanted = useAiEffortStore(state => state[surface])
    const setEffort = useAiEffortStore(state => state.setEffort)
    return [clamp(wanted, efforts), effort => setEffort(surface, effort)]
}

/**
 * The AI of a follow-up: that of `job`, the job it refines, while the project can still use it, until the user picks
 * another one for it; else the one picked in the project. Like the effort, the pick stays with the form.
 */
export const useFollowUpAiModel = (job: AiJob | undefined): [AiModelSummary | undefined, (aiModelId: string) => void] => {
    const { models, selected } = useProjectAiModels()
    const [picked, setPicked] = useState<{ jobId: string; aiModelId: string }>()
    const wanted = picked && picked.jobId === job?._id ? picked.aiModelId : job?.aiModelId
    return [models.find(model => model.id === wanted) ?? selected, aiModelId => job && setPicked({ jobId: job._id, aiModelId })]
}

/**
 * The effort of a follow-up: that of `job`, the job it refines, until the user picks another one for it, within the
 * levels of `aiModel`, the AI it goes to. The pick stays with the form, not with the surface, and a new job to refine
 * starts again from its own effort.
 */
export const useFollowUpEffort = (job: AiJob | undefined, aiModel: AiModelSummary | undefined): [LlmEffort | undefined, (effort: LlmEffort) => void] => {
    const [picked, setPicked] = useState<{ jobId: string; effort: LlmEffort }>()
    // Jobs stored before the effort was recorded worked at `high`.
    const wanted = picked && picked.jobId === job?._id ? picked.effort : (job?.effort ?? "high")
    return [clamp(wanted, effortsOf(aiModel)), effort => job && setPicked({ jobId: job._id, effort })]
}
