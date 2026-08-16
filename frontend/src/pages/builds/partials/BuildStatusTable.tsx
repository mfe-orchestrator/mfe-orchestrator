import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@mfe-orchestrator/design-system"
import { ChevronDown, ChevronRight } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { BuildUnavailableReason, MicrofrontendBuildStatus, ProjectBuildStatus } from "@/hooks/apiClients/useBuildsApi"
import { cn } from "@/utils/styleUtils"
import BuildRunList from "./BuildRunList"
import BuildStatusBadge from "./BuildStatusBadge"

interface BuildStatusTableProps {
    data: ProjectBuildStatus
}

/** Renders a version, or a dash when that environment serves none. */
const VersionCell: React.FC<{ version?: string }> = ({ version }) => (version ? <span className="font-mono text-sm">{version}</span> : <span className="text-foreground-secondary">—</span>)

const BuildStatusTable: React.FC<BuildStatusTableProps> = ({ data }) => {
    const { t } = useTranslation()
    const [expandedIds, setExpandedIds] = useState<string[]>([])

    const toggleExpanded = (microfrontendId: string) => {
        setExpandedIds(current => (current.includes(microfrontendId) ? current.filter(id => id !== microfrontendId) : [...current, microfrontendId]))
    }

    const environments = data.environments || []
    // Header cells before the environment block: expander, microfrontend, last build,
    // tag of that build, last built version.
    const leadingColumns = 5

    const renderLastBuild = (row: MicrofrontendBuildStatus) => {
        if (row.unavailableReason) {
            return <span className="text-sm text-foreground-secondary">{t(`builds.unavailable.${row.unavailableReason}`)}</span>
        }
        const lastBuild = row.builds[0]
        if (!lastBuild) {
            return <span className="text-sm text-foreground-secondary">{t("builds.table.no_runs")}</span>
        }
        return <BuildStatusBadge status={lastBuild.status} />
    }

    return (
        <Table framed scroll="x">
            <TableHeader>
                <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>{t("builds.table.microfrontend")}</TableHead>
                    <TableHead>{t("builds.table.last_build")}</TableHead>
                    <TableHead>{t("builds.table.build_ref")}</TableHead>
                    <TableHead>{t("builds.table.last_built_version")}</TableHead>
                    {environments.map(environment => (
                        <TableHead key={environment._id}>
                            <div className="flex items-center gap-2">
                                <span>{environment.name}</span>
                                {environment.isProduction && <Badge variant="accent">{t("builds.table.production")}</Badge>}
                            </div>
                        </TableHead>
                    ))}
                </TableRow>
            </TableHeader>
            <TableBody>
                {data.microfrontends.map(row => {
                    const isExpanded = expandedIds.includes(row.microfrontendId)
                    const lastBuild = row.builds[0]

                    return [
                        <TableRow key={row.microfrontendId}>
                            <TableCell>
                                <button
                                    type="button"
                                    onClick={() => toggleExpanded(row.microfrontendId)}
                                    aria-expanded={isExpanded}
                                    aria-label={t(isExpanded ? "builds.table.collapse_history" : "builds.table.expand_history", { name: row.name })}
                                    className="p-1"
                                >
                                    {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                                </button>
                            </TableCell>
                            <TableCell>
                                <div className="flex flex-col">
                                    <span className="font-medium">{row.name}</span>
                                    <span className="text-xs text-foreground-secondary font-mono">{row.slug}</span>
                                </div>
                            </TableCell>
                            <TableCell>{renderLastBuild(row)}</TableCell>
                            <TableCell>{lastBuild?.ref ? <span className="font-mono text-sm">{lastBuild.ref}</span> : <span className="text-foreground-secondary">—</span>}</TableCell>
                            <TableCell>
                                <VersionCell version={row.latestBuiltVersion} />
                            </TableCell>
                            {environments.map(environment => (
                                <TableCell key={environment._id}>
                                    <VersionCell version={row.versionByEnvironmentId?.[environment._id]} />
                                </TableCell>
                            ))}
                        </TableRow>,
                        isExpanded && (
                            <TableRow key={`${row.microfrontendId}-history`} className={cn("bg-primary/5")}>
                                <TableCell colSpan={leadingColumns + environments.length}>
                                    <div className="flex flex-col gap-3 py-2">
                                        {row.repositoryName && (
                                            <p className="text-sm text-foreground-secondary">
                                                {t("builds.table.repository", { name: row.repositoryName })}
                                                {row.selectedVersion ? ` · ${t("builds.table.selected_version", { version: row.selectedVersion })}` : ""}
                                            </p>
                                        )}
                                        {row.unavailableReason === BuildUnavailableReason.PROVIDER_ERROR ? (
                                            <p className="text-sm">{t("builds.unavailable.PROVIDER_ERROR")}</p>
                                        ) : (
                                            <BuildRunList runs={row.builds} />
                                        )}
                                    </div>
                                </TableCell>
                            </TableRow>
                        )
                    ]
                })}
            </TableBody>
        </Table>
    )
}

export default BuildStatusTable
