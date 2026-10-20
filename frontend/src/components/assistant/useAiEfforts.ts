import { useGlobalParameters } from "@/contexts/GlobalParameterProvider"
import { LLM_EFFORTS, LlmEffort } from "@/types/ConfigResponseDTO"

const NO_EFFORTS: LlmEffort[] = []

/** The effort levels the backend's AI provider honours, lowest first: empty when the provider offers no choice. */
const useAiEfforts = (): LlmEffort[] => {
    const efforts = useGlobalParameters().getParameter("aiEfforts")
    // A level from a newer backend that the console does not know is left out: it has neither a label nor a rank.
    return Array.isArray(efforts) ? LLM_EFFORTS.filter(level => efforts.includes(level)) : NO_EFFORTS
}

export default useAiEfforts
