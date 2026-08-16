import { Checkbox, SectionHeader, StatTile } from "@mfe-orchestrator/design-system"
import { useQuery } from "@tanstack/react-query"
import { AlertTriangle, GitPullRequestArrow, RefreshCw } from "lucide-react"
import React, { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms"
import { ApiStatusHandler } from "@/components/organisms"
import SinglePageLayout from "@/components/SinglePageLayout"
import useDependenciesApi, { MicrofrontendScanTarget } from "@/hooks/apiClients/useDependenciesApi"
import useProjectStore from "@/store/useProjectStore"
import { AlignPeerDependenciesDialog, BranchSelection, DependencyAlignmentTable, isOutdated, MicrofrontendDependencyList } from "./partials"

/** Branch selected for each microfrontend, falling back to the default branch of its repository */
const toDefaultBranches = (targets: MicrofrontendScanTarget[]): Record<string, string> =>
    targets.reduce<Record<string, string>>((accumulator, target) => {
        if (target.defaultBranch) {
            accumulator[target.microfrontendId] = target.defaultBranch
        }
        return accumulator
    }, {})

const Dependencies: React.FC = () => {
    const { t } = useTranslation()
    const dependenciesApi = useDependenciesApi()
    const { project } = useProjectStore()

    const [onlyOutdated, setOnlyOutdated] = useState(false)
    const [isAlignDialogOpen, setIsAlignDialogOpen] = useState(false)
    // Branch picked in the selector, applied to the scan only when the user asks for it.
    // Both maps only hold the deviations from the repository default branches.
    const [branchOverrides, setBranchOverrides] = useState<Record<string, string>>({})
    const [appliedOverrides, setAppliedOverrides] = useState<Record<string, string>>({})

    const targetsQuery = useQuery({
        queryKey: ["dependencies-targets", project?._id],
        queryFn: () => dependenciesApi.getScanTargets(),
        enabled: Boolean(project?._id)
    })

    const targets = useMemo(() => targetsQuery.data || [], [targetsQuery.data])
    const defaultBranches = useMemo(() => toDefaultBranches(targets), [targets])
    const selectedBranches = useMemo(() => ({ ...defaultBranches, ...branchOverrides }), [defaultBranches, branchOverrides])
    const appliedBranches = useMemo(() => ({ ...defaultBranches, ...appliedOverrides }), [defaultBranches, appliedOverrides])

    const reportQuery = useQuery({
        queryKey: ["dependencies", project?._id, appliedBranches],
        queryFn: () => dependenciesApi.getReport({ branches: appliedBranches }),
        enabled: Boolean(project?._id) && targetsQuery.isSuccess
    })

    const hasPendingBranchChanges = useMemo(
        () => targets.some(target => selectedBranches[target.microfrontendId] !== appliedBranches[target.microfrontendId]),
        [targets, selectedBranches, appliedBranches]
    )

    const onRescan = () => {
        if (hasPendingBranchChanges) {
            setAppliedOverrides(branchOverrides)
        } else {
            reportQuery.refetch()
        }
    }

    const report = reportQuery.data
    const microfrontends = report?.microfrontends || []
    const peerDependencyIssues = report?.peerDependencyIssues || []
    const sharedDependencyIssues = report?.sharedDependencyIssues || []

    const uniquePackages = new Set(microfrontends.flatMap(microfrontend => microfrontend.dependencies.map(dependency => dependency.name)))
    const outdatedPackages = new Set(microfrontends.flatMap(microfrontend => microfrontend.dependencies.filter(isOutdated).map(dependency => dependency.name)))
    const misalignedPeerCount = peerDependencyIssues.length

    return (
        <ApiStatusHandler queries={[targetsQuery, reportQuery]}>
            <SinglePageLayout
                title={t("dependencies.title")}
                description={t("dependencies.description")}
                right={
                    <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" onClick={onRescan} disabled={reportQuery.isFetching}>
                            <RefreshCw className={reportQuery.isFetching ? "animate-spin" : undefined} />
                            {hasPendingBranchChanges ? t("dependencies.rescan_pending") : t("dependencies.rescan")}
                        </Button>
                        <Button onClick={() => setIsAlignDialogOpen(true)} disabled={misalignedPeerCount === 0 || hasPendingBranchChanges}>
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

                <section>
                    <SectionHeader title={t("dependencies.branch_selection_title")} />
                    <BranchSelection
                        targets={targets}
                        selectedBranches={selectedBranches}
                        onChange={(microfrontendId, branch) => setBranchOverrides(current => ({ ...current, [microfrontendId]: branch }))}
                    />
                </section>

                <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
                    <StatTile size="sm" label={t("dependencies.summary_microfrontends")} value={microfrontends.length} />
                    <StatTile size="sm" label={t("dependencies.summary_packages")} value={uniquePackages.size} />
                    <StatTile size="sm" label={t("dependencies.summary_outdated")} value={outdatedPackages.size} />
                    <StatTile size="sm" label={t("dependencies.summary_peer_misaligned")} value={misalignedPeerCount} />
                </div>

                <section>
                    <SectionHeader title={t("dependencies.peer_section_title")} />
                    <DependencyAlignmentTable issues={peerDependencyIssues} emptyMessage={t("dependencies.no_peer_issues")} />
                </section>

                <section>
                    <SectionHeader title={t("dependencies.shared_section_title")} />
                    <p className="text-sm text-foreground-secondary mb-2">{t("dependencies.shared_section_description")}</p>
                    <DependencyAlignmentTable issues={sharedDependencyIssues} emptyMessage={t("dependencies.no_shared_issues")} />
                </section>

                <section>
                    <SectionHeader
                        title={t("dependencies.per_microfrontend_title")}
                        actions={
                            <label className="flex items-center gap-2 text-sm">
                                <Checkbox checked={onlyOutdated} onCheckedChange={checked => setOnlyOutdated(checked === true)} />
                                {t("dependencies.only_outdated")}
                            </label>
                        }
                    />
                    <MicrofrontendDependencyList microfrontends={microfrontends} onlyOutdated={onlyOutdated} />
                </section>

                {report?.scannedAt && <p className="text-xs text-foreground-secondary">{t("dependencies.scanned_at", { date: new Date(report.scannedAt).toLocaleString() })}</p>}

                <AlignPeerDependenciesDialog isOpen={isAlignDialogOpen} onOpenChange={setIsAlignDialogOpen} branches={appliedBranches} onApplied={() => reportQuery.refetch()} />
            </SinglePageLayout>
        </ApiStatusHandler>
    )
}

export default Dependencies
