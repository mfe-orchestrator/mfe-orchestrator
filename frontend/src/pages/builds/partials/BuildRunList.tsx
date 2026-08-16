import { ExternalLink } from "lucide-react"
import { useTranslation } from "react-i18next"
import { BuildRun } from "@/hooks/apiClients/useBuildsApi"
import BuildStatusBadge from "./BuildStatusBadge"

interface BuildRunListProps {
    runs: BuildRun[]
}

const formatMoment = (value?: string) => (value ? new Date(value).toLocaleString() : "—")

/**
 * The recent runs of a single microfrontend, newest first, as shown in the row the
 * user expanded.
 */
const BuildRunList: React.FC<BuildRunListProps> = ({ runs }) => {
    const { t } = useTranslation()

    if (runs.length === 0) {
        return <p className="text-sm text-foreground-secondary">{t("builds.table.no_runs")}</p>
    }

    return (
        <ul className="flex flex-col gap-2">
            {runs.map(run => (
                <li key={run.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <BuildStatusBadge status={run.status} />
                    {run.ref && <span className="font-mono">{run.ref}</span>}
                    {run.name && <span className="text-foreground-secondary">{run.name}</span>}
                    <span className="text-foreground-secondary">{formatMoment(run.startedAt)}</span>
                    {run.triggeredBy && <span className="text-foreground-secondary">{t("builds.table.triggered_by", { user: run.triggeredBy })}</span>}
                    {run.url && (
                        <a href={run.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                            {t("builds.table.open_run")}
                            <ExternalLink className="size-3.5" />
                        </a>
                    )}
                </li>
            ))}
        </ul>
    )
}

export default BuildRunList
