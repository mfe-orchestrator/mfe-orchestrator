import { useQuery, useQueryClient } from "@tanstack/react-query"
import { PackageOpen, RadioTower, RefreshCw } from "lucide-react"
import React, { useCallback } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms"
import { ApiStatusHandler } from "@/components/organisms"
import SinglePageLayout from "@/components/SinglePageLayout"
import useBuildsApi, { BUILD_STATUS_QUERY_KEY, ProjectBuildStatus, useBuildStatusStream } from "@/hooks/apiClients/useBuildsApi"
import useProjectStore from "@/store/useProjectStore"
import { cn } from "@/utils/styleUtils"
import BuildStatusTable from "./partials/BuildStatusTable"

export const Builds: React.FC = () => {
    const { t } = useTranslation()
    const projectStore = useProjectStore()
    const { getBuildStatus } = useBuildsApi()
    const queryClient = useQueryClient()

    const projectId = projectStore.project?._id

    const buildStatusQuery = useQuery({
        queryKey: [BUILD_STATUS_QUERY_KEY, projectId],
        queryFn: getBuildStatus,
        enabled: Boolean(projectId)
    })

    // The stream owns the data from its first frame onwards: it always carries a full
    // snapshot, so it replaces the query cache rather than triggering a refetch.
    const onSnapshot = useCallback(
        (snapshot: ProjectBuildStatus) => {
            queryClient.setQueryData([BUILD_STATUS_QUERY_KEY, projectId], snapshot)
        },
        [queryClient, projectId]
    )

    const stream = useBuildStatusStream(onSnapshot, Boolean(projectId))

    const data = buildStatusQuery.data
    const hasMicrofrontends = (data?.microfrontends?.length ?? 0) > 0

    return (
        <SinglePageLayout
            title={t("builds.title")}
            description={t("builds.subtitle")}
            left={
                <div className="flex items-center gap-4 flex-wrap">
                    <span className="inline-flex items-center gap-2 text-sm text-foreground-secondary">
                        <RadioTower className={cn("size-4", stream.connected ? "text-foreground" : "text-foreground-secondary")} />
                        {stream.connected ? t("builds.live.connected") : t("builds.live.disconnected")}
                    </span>
                    {data?.fetchedAt && <span className="text-sm text-foreground-secondary">{t("builds.live.last_update", { moment: new Date(data.fetchedAt).toLocaleTimeString() })}</span>}
                </div>
            }
            right={
                <Button variant="secondary" onClick={() => buildStatusQuery.refetch()} disabled={buildStatusQuery.isFetching}>
                    <RefreshCw className={cn(buildStatusQuery.isFetching && "animate-spin")} />
                    {t("builds.refresh")}
                </Button>
            }
        >
            <ApiStatusHandler queries={[buildStatusQuery]}>
                {hasMicrofrontends ? (
                    <BuildStatusTable data={data} />
                ) : (
                    <div className="flex flex-col items-center gap-2 py-12 text-center">
                        <PackageOpen className="size-10 text-foreground-secondary" />
                        <h2 className="text-lg font-medium">{t("builds.empty.title")}</h2>
                        <p className="text-foreground-secondary">{t("builds.empty.description")}</p>
                    </div>
                )}
            </ApiStatusHandler>
        </SinglePageLayout>
    )
}

export default Builds
