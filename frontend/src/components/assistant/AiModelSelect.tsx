import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@mfe-orchestrator/design-system"
import { Cpu } from "lucide-react"
import { useTranslation } from "react-i18next"
import { aiModelLabel } from "@/hooks/apiClients/useAiModelsApi"
import { cn } from "@/utils/styleUtils"
import useProjectAiModels from "./useProjectAiModels"

interface AiModelSelectProps {
    value?: string
    onChange: (aiModelId: string) => void
    disabled?: boolean
    /** On the trigger, e.g. to push it away from the buttons it sits with. */
    className?: string
    dataTestId: string
}

/** Which AI of the project the next request goes to; hidden when the project can use only one. */
const AiModelSelect: React.FC<AiModelSelectProps> = ({ value, onChange, disabled, className, dataTestId }) => {
    const { t } = useTranslation()
    const { models } = useProjectAiModels()

    if (!value || models.length < 2) return null

    return (
        <Select layoutSize="sm" value={value} onValueChange={onChange} disabled={disabled}>
            {/* Never squeezed below its label by the field it sits next to. */}
            <SelectTrigger aria-label={t("ai_models.select.label")} title={t("ai_models.select.hint")} className={cn("shrink-0", className)} dataTestId={dataTestId}>
                <Cpu aria-hidden="true" />
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {models.map(model => (
                    <SelectItem key={model.id} value={model.id}>
                        {aiModelLabel(t, model)}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}

export default AiModelSelect
