import { useQuery } from "@tanstack/react-query"
import { Bot } from "lucide-react"
import { useTranslation } from "react-i18next"
import useAiJobsApi from "@/hooks/apiClients/useAiJobsApi"
import useProjectStore from "@/store/useProjectStore"
import { cn } from "@/utils/styleUtils"

/** Slower than the job panel: this only says whether someone is at work, not what the agent is doing. */
const POLL_INTERVAL_MS = 5000

/**
 * How many agents are at work on the microfrontend right now. Every card, node and row reads the same
 * query, so the page asks once per interval however many microfrontends it shows.
 */
export const useWorkingAgents = (microfrontendId: string): number => {
    const projectId = useProjectStore(state => state.project?._id)
    const aiJobsApi = useAiJobsApi()

    const { data } = useQuery({
        queryKey: ["ai-agents-working", projectId],
        queryFn: () => aiJobsApi.working({ silent: true }),
        enabled: Boolean(projectId),
        refetchInterval: POLL_INTERVAL_MS,
        select: working => working.find(entry => entry.microfrontendId === microfrontendId)?.agents ?? 0
    })

    return data ?? 0
}

interface WorkingAgentsIndicatorProps {
    agents: number
    /** The dot and the count only, for the flow nodes and the table where the full label does not fit. */
    compact?: boolean
    className?: string
}

/** A pulsing dot and how many agents are at work; nothing at all while none is. */
export const WorkingAgentsIndicator: React.FC<WorkingAgentsIndicatorProps> = ({ agents, compact = false, className }) => {
    const { t } = useTranslation("platform")

    if (agents <= 0) return null

    const label = t("microfrontend.card.workingAgents", { count: agents })

    return (
        <span role="status" title={label} className={cn("inline-flex min-w-0 shrink-0 items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary", className)}>
            <span className="relative flex size-2 shrink-0" aria-hidden="true">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75 motion-reduce:animate-none" />
                <span className="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
            <Bot className="size-3.5 shrink-0" aria-hidden="true" />
            {compact ? (
                <>
                    <span className="tabular-nums" aria-hidden="true">
                        {agents}
                    </span>
                    <span className="sr-only">{label}</span>
                </>
            ) : (
                <span className="truncate">{label}</span>
            )}
        </span>
    )
}

export default WorkingAgentsIndicator
