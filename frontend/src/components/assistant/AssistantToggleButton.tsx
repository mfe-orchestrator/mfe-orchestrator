import { Sparkles } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useLocation } from "react-router-dom"
import { Button } from "@/components/atoms"
import useAssistantStore from "@/store/useAssistantStore"
import { ASSISTANT_PAGE_PATH } from "./AssistantPanel"
import useProjectAiModels from "./useProjectAiModels"

/** Header entry point to the assistant panel; ⌘J / Ctrl+J does the same. */
const AssistantToggleButton: React.FC = () => {
    const { t } = useTranslation()
    const enabled = useProjectAiModels().enabled
    const { isOpen, toggle } = useAssistantStore()
    const { pathname } = useLocation()

    // On the assistant page the conversation is already open, full width.
    if (!enabled || pathname === ASSISTANT_PAGE_PATH) return null

    return (
        <Button
            variant={isOpen ? "secondary" : "ghost"}
            size="icon"
            aria-label={t("assistant.open")}
            aria-pressed={isOpen}
            title={t("assistant.shortcut")}
            onClick={toggle}
            dataTestId="assistant-toggle"
        >
            <Sparkles />
        </Button>
    )
}

export default AssistantToggleButton
