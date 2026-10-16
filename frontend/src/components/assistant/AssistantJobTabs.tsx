import { TabsList, TabsTrigger } from "@mfe-orchestrator/design-system"
import type { TFunction } from "i18next"
import { X } from "lucide-react"
import { useRef } from "react"
import { useTranslation } from "react-i18next"
import { isAiJobActive } from "@/hooks/apiClients/useAiJobsApi"
import useAssistantJobsStore, { AssistantJobTab } from "@/store/useAssistantJobsStore"

/** A job on one repository is named after its microfrontend; a wider one by how many repositories it touches. */
export const jobTabLabel = (t: TFunction, tab: AssistantJobTab) => tab.microfrontendName ?? t("assistant.jobs.tab_label", { count: tab.repositoryCount })

interface AssistantJobTabsProps {
    projectId: string
    tabs: AssistantJobTab[]
}

/**
 * The tabs of the assistant panel: the project conversation, then one tab per chain of jobs. A tab
 * closes with Delete while it has the focus, as the WAI-ARIA tabs pattern has it, or with its × for
 * the mouse; a running job cannot be closed, its tab is the only place that shows it working.
 */
const AssistantJobTabs: React.FC<AssistantJobTabsProps> = ({ projectId, tabs }) => {
    const { t } = useTranslation()
    const closeTab = useAssistantJobsStore(state => state.closeTab)
    const projectTabRef = useRef<HTMLButtonElement>(null)

    const close = (rootJobId: string) => {
        closeTab(projectId, rootJobId)
        // The closed tab may have had the focus: it would otherwise fall back to the page.
        projectTabRef.current?.focus()
    }

    return (
        <div className="border-b border-divider px-4 py-2">
            <TabsList aria-label={t("assistant.jobs.tabs_label")} className="max-w-full">
                <TabsTrigger ref={projectTabRef} value="project" dataTestId="assistant-tab-project">
                    {t("assistant.jobs.project_tab")}
                </TabsTrigger>
                {tabs.map(tab => {
                    const label = jobTabLabel(t, tab)
                    const running = isAiJobActive(tab.status)
                    return (
                        // Presentational: the tablist owns tabs only.
                        <span key={tab.rootJobId} role="presentation" className="inline-flex max-w-full items-center">
                            <TabsTrigger
                                value={tab.rootJobId}
                                className="min-w-0 max-w-[11rem]"
                                title={label}
                                aria-keyshortcuts={running ? undefined : "Delete"}
                                dataTestId={`assistant-tab-${tab.rootJobId}`}
                                onKeyDown={event => {
                                    if (event.key === "Delete" && !running) {
                                        event.preventDefault()
                                        close(tab.rootJobId)
                                    }
                                }}
                            >
                                {running && <span className="size-2 shrink-0 animate-pulse rounded-full bg-primary" aria-hidden="true" />}
                                <span className="truncate">{label}</span>
                                {running && <span className="sr-only">{t("assistant.jobs.running")}</span>}
                            </TabsTrigger>
                            {!running && (
                                // Hidden from assistive technologies and out of the tab order: the tablist owns tabs only,
                                // and the accessible way to close is Delete on the tab, announced by aria-keyshortcuts.
                                <button
                                    type="button"
                                    tabIndex={-1}
                                    aria-hidden="true"
                                    title={t("assistant.jobs.close_tab", { label })}
                                    className="rounded-xs p-0.5 text-foreground-secondary hover:bg-accent/25 hover:text-foreground"
                                    data-testid={`assistant-tab-close-${tab.rootJobId}`}
                                    onClick={() => close(tab.rootJobId)}
                                >
                                    <X className="size-3" aria-hidden="true" />
                                </button>
                            )}
                        </span>
                    )
                })}
            </TabsList>
        </div>
    )
}

export default AssistantJobTabs
