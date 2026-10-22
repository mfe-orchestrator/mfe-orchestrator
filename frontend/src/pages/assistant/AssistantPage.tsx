import { Spinner } from "@mfe-orchestrator/design-system"
import { useTranslation } from "react-i18next"
import { Navigate } from "react-router-dom"
import AssistantHistory from "@/components/assistant/AssistantHistory"
import AssistantPanel from "@/components/assistant/AssistantPanel"
import useProjectAiModels from "@/components/assistant/useProjectAiModels"
import PageHead from "@/components/PageHead"
import useProjectStore from "@/store/useProjectStore"

/**
 * The assistant on a page of its own: the conversation takes the content area, as in a chat app,
 * with the saved conversations on the right on wide screens (the panel's history button below).
 */
const AssistantPage: React.FC = () => {
    const { t } = useTranslation()
    const { enabled, isPending } = useProjectAiModels()
    const projectId = useProjectStore(state => state.project?._id)

    if (isPending) {
        return (
            <div className="flex min-h-[200px] items-center justify-center">
                <Spinner size={32} />
            </div>
        )
    }

    // Without an AI available to the project the page has nothing to show; the menu does not link to it either.
    if (!enabled) return <Navigate to="/microfrontends" replace />

    return (
        <>
            <PageHead title={t("assistant.page_title")} />
            <div className="flex h-full min-h-0">
                <div className="min-w-0 flex-1">
                    <AssistantPanel variant="page" />
                </div>
                {projectId && (
                    <aside aria-label={t("assistant.history.title")} className="hidden w-72 shrink-0 flex-col border-l border-divider lg:flex" data-testid="assistant-history-sidebar">
                        <AssistantHistory projectId={projectId} />
                    </aside>
                )}
            </div>
        </>
    )
}

export default AssistantPage
