import { useQueries } from "@tanstack/react-query"
import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import useAiJobsApi, { isAiJobActive } from "@/hooks/apiClients/useAiJobsApi"
import useAssistantJobsStore, { AssistantJobTab } from "@/store/useAssistantJobsStore"
import useAssistantStore from "@/store/useAssistantStore"
import useToastNotificationStore from "@/store/useToastNotificationStore"
import { jobTabLabel } from "./AssistantJobTabs"
import { POLL_INTERVAL_MS } from "./AssistantJobThread"

const NO_TABS: AssistantJobTab[] = []

/**
 * Keeps the job tabs of the project up to date while the user is elsewhere: it reopens the tabs of
 * the jobs still running (or waiting for review) after a reload, polls the jobs whose tab is not on
 * screen, and raises a toast when one of them finishes. The tab on screen is polled by its thread.
 */
const useAssistantJobsWatcher = (projectId: string | undefined, enabled: boolean) => {
    const { t } = useTranslation()
    const aiJobsApi = useAiJobsApi()
    const isOpen = useAssistantStore(state => state.isOpen)
    const tabs = useAssistantJobsStore(state => (projectId && state.tabsByProject[projectId]) || NO_TABS)
    const activeTab = useAssistantJobsStore(state => (projectId && state.activeTabByProject[projectId]) || "project")

    // biome-ignore lint/correctness/useExhaustiveDependencies: the api client is recreated every render; the project is what triggers this.
    useEffect(() => {
        if (!enabled || !projectId) return
        aiJobsApi
            .list({ active: true }, { silent: true })
            .then(jobs => useAssistantJobsStore.getState().restoreJobs(projectId, jobs))
            .catch(error => console.error("Could not restore the job tabs", error))
    }, [enabled, projectId])

    // Unknown after a reload, or still running: anything else has nothing left to change on its own.
    const watched = tabs.filter(tab => (tab.status === undefined || isAiJobActive(tab.status)) && !(isOpen && activeTab === tab.rootJobId))

    useQueries({
        queries: watched.map(tab => ({
            queryKey: ["ai-job", tab.jobId],
            queryFn: async () => {
                const job = await aiJobsApi.get(tab.jobId, { silent: true })
                if (projectId) useAssistantJobsStore.getState().syncJob(projectId, job)
                return job
            },
            enabled: enabled && Boolean(projectId),
            retry: false,
            // A job that cannot be read (deleted, another user's) is not asked for again and again.
            refetchInterval: (query: { state: { status: string } }) => (query.state.status === "error" ? false : POLL_INTERVAL_MS)
        }))
    })

    // Whoever polled the job, the thread or the query above, the store sees the status change.
    useEffect(() => {
        if (!projectId) return
        return useAssistantJobsStore.subscribe((state, previous) => {
            const visible = useAssistantStore.getState().isOpen ? state.activeTabByProject[projectId] : undefined
            for (const tab of state.tabsByProject[projectId] ?? []) {
                const before = previous.tabsByProject[projectId]?.find(candidate => candidate.jobId === tab.jobId)
                if (!before || !isAiJobActive(before.status) || isAiJobActive(tab.status) || tab.status === undefined || visible === tab.rootJobId) continue
                const notifications = useToastNotificationStore.getState()
                if (tab.status === "FAILED") notifications.showErrorNotification({ message: t("assistant.jobs.toast_failed", { label: jobTabLabel(t, tab) }) })
                else notifications.showSuccessNotification({ message: t("assistant.jobs.toast_done", { label: jobTabLabel(t, tab) }) })
            }
        })
    }, [projectId, t])
}

export default useAssistantJobsWatcher
