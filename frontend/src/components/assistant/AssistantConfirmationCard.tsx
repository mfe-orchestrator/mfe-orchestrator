import { Card, CardContent, CardFooter, CardHeader, CardTitle, DescriptionItem, DescriptionList } from "@mfe-orchestrator/design-system"
import { ChevronRight, TriangleAlert } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms"
import { AssistantConfirmation } from "@/store/useAssistantStore"
import { formatToolValue } from "./AssistantToolCallRow"

/** Plain values read as text, lists of them as a comma-separated line, anything nested as JSON. */
const readableValue = (value: unknown) => {
    if (value === null || ["string", "number", "boolean"].includes(typeof value)) return String(value)
    if (Array.isArray(value) && value.every(item => ["string", "number", "boolean"].includes(typeof item))) return value.join(", ")
    return formatToolValue(value)
}

interface AssistantConfirmationCardProps {
    confirmation: AssistantConfirmation
    /** True while an answer streams: the card waits for it to end. */
    disabled: boolean
    onAnswer: (approved: boolean) => void
}

/**
 * An action the assistant wants to run: nothing happens until the user confirms it here. What the
 * user checks is `details`, the input with names instead of ids; the input itself stays at hand,
 * folded, for whoever wants to see exactly what the model sent.
 */
const AssistantConfirmationCard: React.FC<AssistantConfirmationCardProps> = ({ confirmation, disabled, onAnswer }) => {
    const { t, i18n } = useTranslation()
    const entries = Object.entries(confirmation.input)
    const details = confirmation.details ?? []
    const expiresAt = new Date(confirmation.expiresAt).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" })

    return (
        <Card className="border-destructive/50 bg-destructive/5 text-sm" dataTestId="assistant-confirmation">
            <CardHeader className="gap-1 p-3 pb-2">
                <div className="flex items-center gap-2">
                    <TriangleAlert className="size-4 shrink-0 text-destructive" aria-hidden="true" />
                    <CardTitle as="h3" className="text-sm">
                        {t("assistant.confirmation.title")}
                    </CardTitle>
                </div>
                <p className="font-medium text-foreground">{confirmation.title}</p>
            </CardHeader>
            {(details.length > 0 || entries.length > 0) && (
                <CardContent className="flex flex-col gap-2 px-3 pb-2">
                    {details.length > 0 && (
                        <DescriptionList dataTestId="assistant-confirmation-details">
                            {details.map((detail, index) => (
                                // Labels repeat (one "environment" per environment deployed): the position keeps them apart.
                                <DescriptionItem key={`${index}-${detail.label}`} label={t(`assistant.confirmation.details.${detail.label}`, { defaultValue: detail.label })}>
                                    <span className="whitespace-pre-wrap break-words">{detail.value}</span>
                                </DescriptionItem>
                            ))}
                        </DescriptionList>
                    )}
                    {entries.length > 0 && (
                        <details className="group text-xs" open={details.length === 0}>
                            <summary className="flex cursor-pointer list-none items-center gap-1 text-foreground-secondary [&::-webkit-details-marker]:hidden">
                                <ChevronRight className="size-3.5 shrink-0 transition-transform group-open:rotate-90" aria-hidden="true" />
                                {t("assistant.confirmation.raw_input")}
                            </summary>
                            <DescriptionList className="pt-2">
                                {entries.map(([key, value]) => (
                                    <DescriptionItem key={key} label={key} monospace>
                                        <span className="whitespace-pre-wrap break-all">{readableValue(value)}</span>
                                    </DescriptionItem>
                                ))}
                            </DescriptionList>
                        </details>
                    )}
                </CardContent>
            )}
            <CardFooter className="flex flex-col items-stretch gap-2 p-3 pt-1">
                {confirmation.status === "pending" ? (
                    <>
                        <p className="text-xs text-foreground-secondary">{t("assistant.confirmation.expires_at", { time: expiresAt })}</p>
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={() => onAnswer(false)} dataTestId="assistant-confirmation-cancel">
                                {t("assistant.confirmation.cancel")}
                            </Button>
                            <Button type="button" variant="destructive" size="sm" disabled={disabled} onClick={() => onAnswer(true)} dataTestId="assistant-confirmation-confirm">
                                {t("assistant.confirmation.confirm")}
                            </Button>
                        </div>
                    </>
                ) : (
                    <p className="text-xs text-foreground-secondary">{t(`assistant.confirmation.status.${confirmation.status}`)}</p>
                )}
            </CardFooter>
        </Card>
    )
}

export default AssistantConfirmationCard
