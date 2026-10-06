import { Sparkles } from "lucide-react"
import { Button } from "@/components/atoms"
import useAssistantStore from "@/store/useAssistantStore"
import useAssistantEnabled from "./useAssistantEnabled"

interface AskAssistantButtonProps {
    /** The question sent to the assistant, already translated and filled with what the page knows. */
    question: string
    label: string
    size?: "default" | "sm"
    variant?: "secondary" | "ghost"
    dataTestId?: string
}

/**
 * Opens the assistant panel with a ready-made question about what the page shows.
 * Renders nothing on installations without the assistant.
 */
const AskAssistantButton: React.FC<AskAssistantButtonProps> = ({ question, label, size = "default", variant = "secondary", dataTestId }) => {
    const enabled = useAssistantEnabled()
    const ask = useAssistantStore(state => state.ask)

    if (!enabled) return null

    return (
        <Button variant={variant} size={size} onClick={() => ask(question)} dataTestId={dataTestId}>
            <Sparkles />
            {label}
        </Button>
    )
}

export default AskAssistantButton
