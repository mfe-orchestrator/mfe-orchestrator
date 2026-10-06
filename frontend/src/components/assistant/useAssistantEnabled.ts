import { useGlobalParameters } from "@/contexts/GlobalParameterProvider"

/** The assistant only exists on installations whose backend has an Anthropic API key. */
const useAssistantEnabled = (): boolean => Boolean(useGlobalParameters().getParameter("assistantEnabled"))

export default useAssistantEnabled
