import { CodeBlock } from "@mfe-orchestrator/design-system"
import { Ban, Check, ChevronRight, CircleAlert, CircleSlash, Hourglass, LoaderCircle } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/atoms"
import { AssistantToolCall } from "@/store/useAssistantStore"

/** Tool input and results as indented JSON; a result too long for the stream already arrives as a string preview. */
export const formatToolValue = (value: unknown) => (typeof value === "string" ? value : JSON.stringify(value, null, 2))

const StatusIcon: React.FC<{ status: AssistantToolCall["status"] }> = ({ status }) => {
    const className = "size-3.5 shrink-0"
    if (status === "running") return <LoaderCircle className={`${className} animate-spin text-foreground-secondary`} aria-hidden="true" />
    if (status === "ok") return <Check className={`${className} text-green-600`} aria-hidden="true" />
    if (status === "error") return <CircleAlert className={`${className} text-destructive`} aria-hidden="true" />
    if (status === "awaiting_confirmation") return <Hourglass className={`${className} text-primary`} aria-hidden="true" />
    if (status === "declined") return <Ban className={`${className} text-foreground-secondary`} aria-hidden="true" />
    return <CircleSlash className={`${className} text-foreground-secondary`} aria-hidden="true" />
}

/** One tool the assistant called: a compact line that opens on what it was asked and what it returned. */
const AssistantToolCallRow: React.FC<{ tool: AssistantToolCall }> = ({ tool }) => {
    const { t } = useTranslation()
    const hasInput = Object.keys(tool.input).length > 0

    return (
        <details className="group rounded-md border border-divider text-xs" data-testid={`assistant-tool-${tool.id}`}>
            <summary className="flex cursor-pointer list-none items-center gap-2 px-2 py-1.5 [&::-webkit-details-marker]:hidden">
                <StatusIcon status={tool.status} />
                <span className="sr-only">{t(`assistant.tool_status.${tool.status}`)}</span>
                <span className="flex-1 truncate text-foreground">{tool.title}</span>
                {tool.kind !== "read" && <Badge variant={tool.kind === "destructive" ? "destructive" : tool.kind === "confirm" ? "accent" : "outline"}>{t(`assistant.tool_kind.${tool.kind}`)}</Badge>}
                <ChevronRight className="size-3.5 shrink-0 text-foreground-secondary transition-transform group-open:rotate-90" aria-hidden="true" />
            </summary>
            <div className="flex flex-col gap-2 border-t border-divider px-2 py-2">
                <p className={tool.status === "error" ? "text-destructive" : "text-foreground-secondary"}>
                    {tool.status === "error" && tool.summary ? tool.summary : t(`assistant.tool_status.${tool.status}`)}
                </p>
                {hasInput && <CodeBlock size="sm" label={t("assistant.tool.input")} code={formatToolValue(tool.input)} maxHeightClassName="max-h-40" />}
                {tool.result !== undefined && (
                    <CodeBlock
                        size="sm"
                        label={t("assistant.tool.result")}
                        code={formatToolValue(tool.result)}
                        maxHeightClassName="max-h-60"
                        copyable
                        copyLabel={t("assistant.tool.copy")}
                        copiedLabel={t("assistant.tool.copied")}
                    />
                )}
            </div>
        </details>
    )
}

export default AssistantToolCallRow
