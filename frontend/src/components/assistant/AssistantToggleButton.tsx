import { Sparkles } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms"
import useAssistantStore from "@/store/useAssistantStore"
import useAssistantEnabled from "./useAssistantEnabled"

/** Header entry point to the assistant panel; ⌘J / Ctrl+J does the same. */
const AssistantToggleButton: React.FC = () => {
    const { t } = useTranslation()
    const enabled = useAssistantEnabled()
    const { isOpen, toggle } = useAssistantStore()

    if (!enabled) return null

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
