import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@mfe-orchestrator/design-system"
import { Brain } from "lucide-react"
import { useTranslation } from "react-i18next"
import type { LlmEffort } from "@/types/ConfigResponseDTO"
import { cn } from "@/utils/styleUtils"
import useAiEfforts from "./useAiEfforts"

interface EffortSelectProps {
    value?: LlmEffort
    onChange: (effort: LlmEffort) => void
    disabled?: boolean
    /** On the trigger, e.g. to push it away from the buttons it sits with. */
    className?: string
    dataTestId: string
}

/** How hard the agent reasons on the next request; hidden when the provider offers no choice. */
const EffortSelect: React.FC<EffortSelectProps> = ({ value, onChange, disabled, className, dataTestId }) => {
    const { t } = useTranslation()
    const available = useAiEfforts()

    if (!value || available.length === 0) return null

    return (
        <Select layoutSize="sm" value={value} onValueChange={effort => onChange(effort as LlmEffort)} disabled={disabled}>
            {/* Never squeezed below its label by the field it sits next to. */}
            <SelectTrigger aria-label={t("assistant.effort.label")} title={t("assistant.effort.hint")} className={cn("shrink-0", className)} dataTestId={dataTestId}>
                <Brain aria-hidden="true" />
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {available.map(effort => (
                    <SelectItem key={effort} value={effort}>
                        {t(`assistant.effort.levels.${effort}`)}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}

export default EffortSelect
