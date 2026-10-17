import { useTranslation } from "react-i18next"
import { Navigate } from "react-router-dom"
import AssistantPanel from "@/components/assistant/AssistantPanel"
import useAssistantEnabled from "@/components/assistant/useAssistantEnabled"
import PageHead from "@/components/PageHead"

/** The assistant on a page of its own: the conversation takes the whole content area, as in a chat app. */
const AssistantPage: React.FC = () => {
    const { t } = useTranslation()
    const enabled = useAssistantEnabled()

    // Without an AI provider the page has nothing to show; the menu does not link to it either.
    if (!enabled) return <Navigate to="/microfrontends" replace />

    return (
        <>
            <PageHead title={t("assistant.page_title")} />
            <AssistantPanel variant="page" />
        </>
    )
}

export default AssistantPage
