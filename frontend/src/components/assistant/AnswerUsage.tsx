import { Coins } from "lucide-react"
import { useTranslation } from "react-i18next"
import type { AssistantUsage } from "@/store/useAssistantStore"
import type { LlmEffort } from "@/types/ConfigResponseDTO"

interface AnswerUsageProps {
    usage: AssistantUsage
    /** What the figures are the cost of, when it is not obvious from where they sit. */
    label?: string
    /** The tooltip; by default it describes the cost of one answer. */
    hint?: string
    /** The reasoning effort the figures were spent at, when known. */
    effort?: LlmEffort
}

/** What the answer cost, in tokens: the cached part of the prompt is shown apart, being far cheaper. */
const AnswerUsage: React.FC<AnswerUsageProps> = ({ usage, label, hint, effort }) => {
    const { t, i18n } = useTranslation()
    const format = (value: number) => value.toLocaleString(i18n.language)
    const input =
        usage.cachedInputTokens > 0
            ? t("assistant.usage.input_cached", { count: usage.inputTokens, formatted: format(usage.inputTokens), cached: format(usage.cachedInputTokens) })
            : t("assistant.usage.input", { formatted: format(usage.inputTokens) })

    return (
        <p className="flex flex-wrap items-center gap-1 text-xs text-foreground-secondary" data-testid="assistant-usage" title={hint ?? t("assistant.usage.hint")}>
            <Coins className="size-3" aria-hidden />
            {label && <span className="font-medium">{label}:</span>}
            {input} · {t("assistant.usage.output", { formatted: format(usage.outputTokens) })}
            {effort && ` · ${t("assistant.effort.used", { level: t(`assistant.effort.levels.${effort}`) })}`}
        </p>
    )
}

export default AnswerUsage
