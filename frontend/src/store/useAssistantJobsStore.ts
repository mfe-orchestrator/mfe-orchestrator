import { create } from "zustand"
import { createJSONStorage, devtools, persist } from "zustand/middleware"
import type { AiJob, AiJobStatus } from "@/hooks/apiClients/useAiJobsApi"

/** The project conversation, or the chain of jobs with that root id. */
export type AssistantTab = "project" | string

/** A chain of jobs open as a tab of the assistant panel. */
export interface AssistantJobTab {
    rootJobId: string
    /** The latest job of the chain: the one polled and followed up. */
    jobId: string
    /** Set when the job works on one repository: the tab is named after its microfrontend. */
    microfrontendName?: string
    repositoryCount: number
    /** Of the latest job. In memory only: polling fills it in again after a reload. */
    status?: AiJobStatus
}

interface AssistantJobsState {
    tabsByProject: Record<string, AssistantJobTab[]>
    /** In memory only: opening the console shows the conversation, a new one, not the tab left open. */
    activeTabByProject: Record<string, AssistantTab>
    /** Chains whose tab the user closed: restoring after a reload leaves them closed. */
    dismissedByProject: Record<string, string[]>
    /** Opens the tab of the job's chain, or points it to this job; `focus` also makes it the active tab. */
    openJob: (projectId: string, job: AiJob, focus?: boolean) => void
    /** Refreshes the tab showing this job with what polling returned; an older job of the chain changes nothing. */
    syncJob: (projectId: string, job: AiJob) => void
    /** Opens the chains that have no tab yet and were not closed, leaving the active tab alone: `jobs` come newest first. */
    restoreJobs: (projectId: string, jobs: AiJob[]) => void
    setActiveTab: (projectId: string, tab: AssistantTab) => void
    closeTab: (projectId: string, rootJobId: string) => void
    /** Forgets every tab: on logout, with the conversations. */
    clearAll: () => void
}

/** The list endpoint returns at most 20 jobs: remembering more closed chains than that serves no purpose. */
const MAX_DISMISSED = 50

const toTab = (job: AiJob): AssistantJobTab => ({
    rootJobId: job.rootJobId,
    jobId: job._id,
    microfrontendName: job.repositories.length === 1 ? job.repositories[0].microfrontendName : undefined,
    repositoryCount: job.repositories.length,
    status: job.status
})

const useAssistantJobsStore = create<AssistantJobsState>()(
    devtools(
        persist(
            (set, get) => ({
                tabsByProject: {},
                activeTabByProject: {},
                dismissedByProject: {},
                openJob: (projectId, job, focus = false) => {
                    const { tabsByProject, activeTabByProject, dismissedByProject } = get()
                    const tabs = tabsByProject[projectId] ?? []
                    const opened = tabs.some(tab => tab.rootJobId === job.rootJobId)
                    set({
                        tabsByProject: { ...tabsByProject, [projectId]: opened ? tabs.map(tab => (tab.rootJobId === job.rootJobId ? toTab(job) : tab)) : [...tabs, toTab(job)] },
                        activeTabByProject: focus ? { ...activeTabByProject, [projectId]: job.rootJobId } : activeTabByProject,
                        // Opened again on purpose (a new job, a follow-up, the chat): it is wanted back.
                        dismissedByProject: { ...dismissedByProject, [projectId]: (dismissedByProject[projectId] ?? []).filter(id => id !== job.rootJobId) }
                    })
                },
                syncJob: (projectId, job) => {
                    const { tabsByProject } = get()
                    const tabs = tabsByProject[projectId]
                    if (!tabs?.some(tab => tab.jobId === job._id)) return
                    set({ tabsByProject: { ...tabsByProject, [projectId]: tabs.map(tab => (tab.jobId === job._id ? toTab(job) : tab)) } })
                },
                restoreJobs: (projectId, jobs) => {
                    const { tabsByProject, dismissedByProject } = get()
                    const tabs = [...(tabsByProject[projectId] ?? [])]
                    const dismissed = dismissedByProject[projectId] ?? []
                    for (const job of jobs) {
                        // Newest first: the first job of a chain met is its latest.
                        if (!dismissed.includes(job.rootJobId) && !tabs.some(tab => tab.rootJobId === job.rootJobId)) tabs.push(toTab(job))
                    }
                    set({ tabsByProject: { ...tabsByProject, [projectId]: tabs } })
                },
                setActiveTab: (projectId, tab) => set({ activeTabByProject: { ...get().activeTabByProject, [projectId]: tab } }),
                closeTab: (projectId, rootJobId) => {
                    const { tabsByProject, activeTabByProject, dismissedByProject } = get()
                    const dismissed = (dismissedByProject[projectId] ?? []).filter(id => id !== rootJobId)
                    set({
                        tabsByProject: { ...tabsByProject, [projectId]: (tabsByProject[projectId] ?? []).filter(tab => tab.rootJobId !== rootJobId) },
                        activeTabByProject: activeTabByProject[projectId] === rootJobId ? { ...activeTabByProject, [projectId]: "project" } : activeTabByProject,
                        dismissedByProject: { ...dismissedByProject, [projectId]: [...dismissed, rootJobId].slice(-MAX_DISMISSED) }
                    })
                },
                clearAll: () => set({ tabsByProject: {}, activeTabByProject: {}, dismissedByProject: {} })
            }),
            {
                name: "assistant-job-tabs",
                storage: createJSONStorage(() => localStorage),
                // Ids and the label only: what the job did is read from the server again.
                partialize: state => ({
                    tabsByProject: Object.fromEntries(Object.entries(state.tabsByProject).map(([projectId, tabs]) => [projectId, tabs.map(({ status: _status, ...tab }) => tab)])),
                    dismissedByProject: state.dismissedByProject
                })
            }
        ),
        {
            name: "assistant-job-tabs-storage"
        }
    )
)

export default useAssistantJobsStore
