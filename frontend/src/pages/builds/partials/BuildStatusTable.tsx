import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@mfe-orchestrator/design-system"
import { ChevronDown, ChevronRight, LayoutDashboard, Server } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { BuildUnavailableReason, ComponentBuildStatus, ProjectBuildStatus } from "@/hooks/apiClients/useBuildsApi"
import { cn } from "@/utils/styleUtils"
import BuildRunList, { BuildComponentKind } from "./BuildRunList"
import BuildStatusBadge from "./BuildStatusBadge"
import ProviderRunLink from "./ProviderRunLink"

interface BuildStatusTableProps {
    data: ProjectBuildStatus
}

/** One row of the table: a microfrontend (frontend build) or a service (backend build). */
interface BuildStatusRow extends ComponentBuildStatus {
    kind: BuildComponentKind
    id: string
}

/** Microfrontends and services share one id space only once the kind is part of the key. */
const rowKey = (row: BuildStatusRow) => `${row.kind}-${row.id}`

/** Renders a version, or a dash when that environment serves none. */
const VersionCell: React.FC<{ version?: string }> = ({ version }) => (version ? <span className="font-mono text-sm">{version}</span> : <span className="text-foreground-secondary">—</span>)

const KindBadge: React.FC<{ kind: BuildComponentKind }> = ({ kind }) => {
    const { t } = useTranslation()
    const Icon = kind === BuildComponentKind.BACKEND ? Server : LayoutDashboard
    return (
        <Badge variant="outline">
            <Icon className="size-3.5 shrink-0" />
            <span>{t(`builds.kind.${kind}`)}</span>
        </Badge>
    )
}

const BuildStatusTable: React.FC<BuildStatusTableProps> = ({ data }) => {
    const { t } = useTranslation()
    const [expandedKeys, setExpandedKeys] = useState<string[]>([])

    const toggleExpanded = (key: string) => {
        setExpandedKeys(current => (current.includes(key) ? current.filter(expandedKey => expandedKey !== key) : [...current, key]))
    }

    const environments = data.environments || []
    // Frontends first, then backends: each list already comes sorted by name.
    const rows: BuildStatusRow[] = [
        ...(data.microfrontends || []).map(({ microfrontendId, ...row }) => ({ ...row, kind: BuildComponentKind.FRONTEND, id: microfrontendId })),
        ...(data.services || []).map(({ serviceId, ...row }) => ({ ...row, kind: BuildComponentKind.BACKEND, id: serviceId }))
    ]
    // Header cells before the environment block: expander, name, type, last build,
    // tag of that build, last built version.
    const leadingColumns = 6

    const renderLastBuild = (row: BuildStatusRow) => {
        if (row.unavailableReason) {
            return <span className="text-sm text-foreground-secondary">{t(`builds.unavailable.${row.unavailableReason}`)}</span>
        }
        const lastBuild = row.builds[0]
        if (!lastBuild) {
            return <span className="text-sm text-foreground-secondary">{t("builds.table.no_runs")}</span>
        }
        return (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <BuildStatusBadge status={lastBuild.status} />
                {lastBuild.url && <ProviderRunLink url={lastBuild.url} provider={row.provider} />}
            </div>
        )
    }

    return (
        <Table framed scroll="x">
            <TableHeader>
                <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>{t("builds.table.name")}</TableHead>
                    <TableHead>{t("builds.table.kind")}</TableHead>
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
                {rows.map(row => {
                    const key = rowKey(row)
                    const isExpanded = expandedKeys.includes(key)
                    const lastBuild = row.builds[0]

                    return [
                        <TableRow key={key}>
                            <TableCell>
                                <button
                                    type="button"
                                    onClick={() => toggleExpanded(key)}
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
                            <TableCell>
                                <KindBadge kind={row.kind} />
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
                            <TableRow key={`${key}-history`} className={cn("bg-primary/5")}>
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
                                            <BuildRunList runs={row.builds} kind={row.kind} componentId={row.id} componentName={row.name} provider={row.provider} />
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
