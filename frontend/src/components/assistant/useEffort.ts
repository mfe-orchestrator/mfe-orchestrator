import { useState } from "react"
import type { AiJob } from "@/hooks/apiClients/useAiJobsApi"
import useAiEffortStore, { EffortSurface } from "@/store/useAiEffortStore"
import { LLM_EFFORTS, LlmEffort } from "@/types/ConfigResponseDTO"
import useAiEfforts from "./useAiEfforts"

/** `wanted`, else the closest level below it the provider offers, else its lowest: never more than asked when it can be helped. */
const clamp = (wanted: LlmEffort, available: LlmEffort[]): LlmEffort | undefined => {
    if (available.includes(wanted)) return wanted
    const rank = LLM_EFFORTS.indexOf(wanted)
    return [...available].reverse().find(level => LLM_EFFORTS.indexOf(level) < rank) ?? available[0]
}

/**
 * The effort picked on `surface`, shared by every selector of it and remembered across visits. Undefined when the
 * provider offers no choice: nothing is sent then, and the backend applies its default.
 */
export const useEffort = (surface: EffortSurface): [LlmEffort | undefined, (effort: LlmEffort) => void] => {
    const available = useAiEfforts()
    const wanted = useAiEffortStore(state => state[surface])
    const setEffort = useAiEffortStore(state => state.setEffort)
    return [clamp(wanted, available), effort => setEffort(surface, effort)]
}

/**
 * The effort of a follow-up: that of `job`, the job it refines, until the user picks another one for it. The pick
 * stays with the form, not with the surface, and a new job to refine starts again from its own effort.
 */
export const useFollowUpEffort = (job: AiJob | undefined): [LlmEffort | undefined, (effort: LlmEffort) => void] => {
    const available = useAiEfforts()
    const [picked, setPicked] = useState<{ jobId: string; effort: LlmEffort }>()
    // Jobs stored before the effort was recorded worked at `high`.
    const wanted = picked && picked.jobId === job?._id ? picked.effort : (job?.effort ?? "high")
    return [clamp(wanted, available), effort => job && setPicked({ jobId: job._id, effort })]
}
