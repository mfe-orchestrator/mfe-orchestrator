import { format } from "date-fns"
import { Brain } from "lucide-react"
import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import type { IBadgeProps } from "@/components/atoms"
import { Badge } from "@/components/atoms"
import type { AiChangeEvent, AiChangeStatus } from "@/hooks/apiClients/useAiChangesApi"

const STATUS_VARIANT: Record<AiChangeStatus, IBadgeProps["variant"]> = {
    PENDING: "outline",
    RUNNING: "outline",
    APPLYING: "outline",
    PROPOSED: "accent",
    APPLIED: "default",
    DISCARDED: "outline",
    FAILED: "destructive"
}

/** The status of an AI change request, shared by the microfrontend page and the job tabs of the assistant. */
export const StatusBadge: React.FC<{ status: AiChangeStatus }> = ({ status }) => {
    const { t } = useTranslation()
    return <Badge variant={STATUS_VARIANT[status]}>{t(`microfrontend.aiChange.status.${status}`)}</Badge>
}

/** What the agent did, step by step: `live` announces new steps to screen readers. */
export const ProgressLog: React.FC<{ events: AiChangeEvent[]; live: boolean }> = ({ events, live }) => {
    const { t } = useTranslation()
    const containerRef = useRef<HTMLDivElement>(null)

    // Newest last, as in a terminal: keep the latest step in view while the agent works.
    // biome-ignore lint/correctness/useExhaustiveDependencies: a new event is what must trigger the scroll
    useEffect(() => {
        if (containerRef.current) containerRef.current.scrollTop = containerRef.current.scrollHeight
    }, [events.length])

    return (
        <div
            ref={containerRef}
            role="log"
            aria-live={live ? "polite" : "off"}
            aria-label={t("microfrontend.aiChange.progress_log")}
            className="max-h-64 overflow-auto rounded-md border border-divider bg-muted/40 p-3 text-xs"
        >
            {events.length === 0 ? (
                <p className="text-muted-foreground">{t("microfrontend.aiChange.progress_empty")}</p>
            ) : (
                <ol className="flex flex-col gap-1">
                    {events.map((event, index) => (
                        <li key={`${event.at}-${index}`} className="flex gap-2">
                            <time dateTime={event.at} className="shrink-0 font-mono text-muted-foreground">
                                {format(new Date(event.at), "HH:mm:ss")}
                            </time>
                            {event.kind === "info" && <span className="font-medium">{t(`microfrontend.aiChange.events.${event.message}`, { defaultValue: event.message })}</span>}
                            {event.kind === "tool" && <span className="break-all font-mono text-muted-foreground">{event.message}</span>}
                            {event.kind === "text" && <span className="whitespace-pre-wrap break-words">{event.message}</span>}
                            {/* Muted and apart from what the agent said: how it reasoned, not what it did. */}
                            {event.kind === "thinking" && (
                                <span className="flex min-w-0 gap-1 italic text-muted-foreground">
                                    <Brain className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                                    <span className="sr-only">{t("assistant.reasoning")}:</span>
                                    <span className="whitespace-pre-wrap break-words">{event.message}</span>
                                </span>
                            )}
                        </li>
                    ))}
                </ol>
            )}
        </div>
    )
}
