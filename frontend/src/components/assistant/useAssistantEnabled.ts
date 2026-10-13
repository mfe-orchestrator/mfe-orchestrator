import { useGlobalParameters } from "@/contexts/GlobalParameterProvider"

/** The assistant only exists on installations whose backend has an AI provider configured (see docs/AI-PROVIDERS.md). */
const useAssistantEnabled = (): boolean => Boolean(useGlobalParameters().getParameter("assistantEnabled"))

export default useAssistantEnabled
