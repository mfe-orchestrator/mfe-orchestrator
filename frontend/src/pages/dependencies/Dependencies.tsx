import { useQuery } from "@tanstack/react-query"
import { AlertTriangle, GitPullRequestArrow, RefreshCw } from "lucide-react"
import React, { useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms"
import { ApiStatusHandler } from "@/components/organisms"
import SinglePageLayout from "@/components/SinglePageLayout"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import useDependenciesApi from "@/hooks/apiClients/useDependenciesApi"
import useProjectStore from "@/store/useProjectStore"
import { AlignPeerDependenciesDialog, DependencyAlignmentTable, isOutdated, MicrofrontendDependencyList } from "./partials"

interface SummaryCardProps {
    label: string
    value: number | string
}

const SummaryCard: React.FC<SummaryCardProps> = ({ label, value }) => (
    <Card>
        <CardContent className="p-4">
            <p className="text-sm text-foreground-secondary">{label}</p>
            <p className="text-2xl font-bold text-foreground">{value}</p>
        </CardContent>
    </Card>
)

const Dependencies: React.FC = () => {
    const { t } = useTranslation()
    const dependenciesApi = useDependenciesApi()
    const { project } = useProjectStore()

    const [onlyOutdated, setOnlyOutdated] = useState(false)
    const [isAlignDialogOpen, setIsAlignDialogOpen] = useState(false)

    const reportQuery = useQuery({
        queryKey: ["dependencies", project?._id],
        queryFn: () => dependenciesApi.getReport(),
        enabled: Boolean(project?._id)
    })

    const report = reportQuery.data
    const microfrontends = report?.microfrontends || []
    const peerDependencyIssues = report?.peerDependencyIssues || []
    const sharedDependencyIssues = report?.sharedDependencyIssues || []

    const uniquePackages = new Set(microfrontends.flatMap(microfrontend => microfrontend.dependencies.map(dependency => dependency.name)))
    const outdatedPackages = new Set(microfrontends.flatMap(microfrontend => microfrontend.dependencies.filter(isOutdated).map(dependency => dependency.name)))
    const misalignedPeerCount = peerDependencyIssues.length

    return (
        <ApiStatusHandler queries={[reportQuery]}>
            <SinglePageLayout
                title={t("dependencies.title")}
                description={t("dependencies.description")}
                right={
                    <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" onClick={() => reportQuery.refetch()} disabled={reportQuery.isFetching}>
                            <RefreshCw className={reportQuery.isFetching ? "animate-spin" : undefined} />
                            {t("dependencies.rescan")}
                        </Button>
                        <Button onClick={() => setIsAlignDialogOpen(true)} disabled={misalignedPeerCount === 0}>
                            <GitPullRequestArrow />
                            {t("dependencies.align_peer_dependencies")}
                        </Button>
                    </div>
                }
            >
                {report && !report.registryAvailable && (
                    <div className="flex items-center gap-2 rounded-md border-2 border-destructive bg-destructive/15 p-3 text-sm text-destructive-active">
                        <AlertTriangle className="w-4 h-4" />
                        {t("dependencies.registry_unavailable")}
                    </div>
                )}

                <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
                    <SummaryCard label={t("dependencies.summary_microfrontends")} value={microfrontends.length} />
                    <SummaryCard label={t("dependencies.summary_packages")} value={uniquePackages.size} />
                    <SummaryCard label={t("dependencies.summary_outdated")} value={outdatedPackages.size} />
                    <SummaryCard label={t("dependencies.summary_peer_misaligned")} value={misalignedPeerCount} />
                </div>

                <section>
                    <h2 className="text-xl font-medium mb-2 text-foreground-secondary">{t("dependencies.peer_section_title")}</h2>
                    <DependencyAlignmentTable issues={peerDependencyIssues} emptyMessage={t("dependencies.no_peer_issues")} />
                </section>

                <section>
                    <h2 className="text-xl font-medium mb-2 text-foreground-secondary">{t("dependencies.shared_section_title")}</h2>
                    <p className="text-sm text-foreground-secondary mb-2">{t("dependencies.shared_section_description")}</p>
                    <DependencyAlignmentTable issues={sharedDependencyIssues} emptyMessage={t("dependencies.no_shared_issues")} />
                </section>

                <section>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <h2 className="text-xl font-medium text-foreground-secondary">{t("dependencies.per_microfrontend_title")}</h2>
                        <label className="flex items-center gap-2 text-sm">
                            <Checkbox checked={onlyOutdated} onCheckedChange={checked => setOnlyOutdated(checked === true)} />
                            {t("dependencies.only_outdated")}
                        </label>
                    </div>
                    <MicrofrontendDependencyList microfrontends={microfrontends} onlyOutdated={onlyOutdated} />
                </section>

                {report?.scannedAt && <p className="text-xs text-foreground-secondary">{t("dependencies.scanned_at", { date: new Date(report.scannedAt).toLocaleString() })}</p>}

                <AlignPeerDependenciesDialog isOpen={isAlignDialogOpen} onOpenChange={setIsAlignDialogOpen} onApplied={() => reportQuery.refetch()} />
            </SinglePageLayout>
        </ApiStatusHandler>
    )
}

export default Dependencies
