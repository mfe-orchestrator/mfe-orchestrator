import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
    Card,
    CardContent,
    EmptyState,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@mfe-orchestrator/design-system"
import { AlertTriangle, GitBranch } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/atoms"
import { Dependency, DependencyKind, DependencyUpdateStatus, MicrofrontendDependencies } from "@/hooks/apiClients/useDependenciesApi"
import DependencyStatusBadge from "./DependencyStatusBadge"

const KIND_ORDER: DependencyKind[] = [DependencyKind.PROD, DependencyKind.PEER, DependencyKind.DEV, DependencyKind.OPTIONAL]

export const isOutdated = (dependency: Dependency): boolean =>
    dependency.status === DependencyUpdateStatus.PATCH_BEHIND || dependency.status === DependencyUpdateStatus.MINOR_BEHIND || dependency.status === DependencyUpdateStatus.MAJOR_BEHIND

export interface MicrofrontendDependencyListProps {
    microfrontends: MicrofrontendDependencies[]
    onlyOutdated: boolean
}

export const MicrofrontendDependencyList: React.FC<MicrofrontendDependencyListProps> = ({ microfrontends, onlyOutdated }) => {
    const { t } = useTranslation()

    if (microfrontends.length === 0) {
        return (
            <Card>
                <CardContent className="p-0">
                    <EmptyState size="sm" description={t("dependencies.no_microfrontends")} />
                </CardContent>
            </Card>
        )
    }

    return (
        <Accordion type="single" collapsible>
            {microfrontends.map(microfrontend => {
                const dependencies = (onlyOutdated ? microfrontend.dependencies.filter(isOutdated) : microfrontend.dependencies)
                    .slice()
                    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.name.localeCompare(b.name))

                const outdatedCount = microfrontend.dependencies.filter(isOutdated).length

                return (
                    <AccordionItem key={microfrontend.microfrontendId} value={microfrontend.microfrontendId}>
                        <AccordionTrigger>
                            <div className="flex flex-wrap items-center gap-2 text-left">
                                <h3 className="font-medium">{microfrontend.name}</h3>
                                <span className="text-sm text-foreground-secondary font-normal">
                                    {microfrontend.repositoryName}
                                    {microfrontend.branch ? ` @ ${microfrontend.branch}` : ""}
                                </span>
                                {microfrontend.branch && microfrontend.branch !== microfrontend.defaultBranch && (
                                    <Badge variant="accent">
                                        <GitBranch className="w-3 h-3" />
                                        {t("dependencies.branch_not_default")}
                                    </Badge>
                                )}
                                {microfrontend.error ? (
                                    <Badge variant="destructive">
                                        <AlertTriangle className="w-3 h-3" />
                                        {t("dependencies.scan_failed")}
                                    </Badge>
                                ) : (
                                    <>
                                        <Badge variant="outline">{t("dependencies.dependencies_count", { count: microfrontend.dependencies.length })}</Badge>
                                        {outdatedCount > 0 && <Badge variant="accent">{t("dependencies.outdated_count", { count: outdatedCount })}</Badge>}
                                    </>
                                )}
                            </div>
                        </AccordionTrigger>
                        <AccordionContent>
                            {microfrontend.error ? (
                                <p className="text-destructive-active text-sm">{microfrontend.error}</p>
                            ) : dependencies.length === 0 ? (
                                <EmptyState size="sm" description={onlyOutdated ? t("dependencies.all_up_to_date") : t("dependencies.no_dependencies")} />
                            ) : (
                                <div className="rounded-md border-2 border-border overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-primary/25">
                                                <TableHead className="text-foreground">{t("dependencies.package")}</TableHead>
                                                <TableHead className="text-foreground">{t("dependencies.kind")}</TableHead>
                                                <TableHead className="text-foreground">{t("dependencies.declared_range")}</TableHead>
                                                <TableHead className="text-foreground">{t("dependencies.latest_version")}</TableHead>
                                                <TableHead className="text-foreground">{t("dependencies.status_column")}</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {dependencies.map(dependency => (
                                                <TableRow key={`${dependency.kind}-${dependency.name}`}>
                                                    <TableCell className="font-medium">
                                                        <div className="flex items-center gap-2">
                                                            {dependency.name}
                                                            {dependency.deprecated && <Badge variant="destructive">{t("dependencies.deprecated")}</Badge>}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline">{t(`dependencies.kinds.${dependency.kind}`)}</Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        <code className="text-sm">{dependency.range}</code>
                                                    </TableCell>
                                                    <TableCell>{dependency.latestVersion || "-"}</TableCell>
                                                    <TableCell>
                                                        <DependencyStatusBadge status={dependency.status} />
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </AccordionContent>
                    </AccordionItem>
                )
            })}
        </Accordion>
    )
}

export default MicrofrontendDependencyList
