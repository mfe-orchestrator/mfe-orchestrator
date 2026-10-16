import { Alert, AlertDescription, Spinner } from "@mfe-orchestrator/design-system"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Navigate, useParams, useSearchParams } from "react-router-dom"
import useAssistantEnabled from "@/components/assistant/useAssistantEnabled"
import useMicrofrontendsApi from "@/hooks/apiClients/useMicrofrontendsApi"
import { AiChangeWorkspace, isAiEditAvailable, MicrofrontendHeader } from "@/pages/microfrontends/partials/components"

/** The landing screen of a microfrontend: Edit with AI. Without AI editing, the details screen takes its place. */
const MicrofrontendAiWorkspacePage: React.FC = () => {
    const { t } = useTranslation()
    const { id } = useParams<{ id: string }>()
    const [searchParams] = useSearchParams()
    const assistantEnabled = useAssistantEnabled()
    const microfrontendsApi = useMicrofrontendsApi()

    const frontendQuery = useQuery({
        queryKey: ["mfe", id],
        queryFn: () => microfrontendsApi.getSingle(id)
    })

    // Links made when every section was a tab of this page: `?tab=hosting` and the like now belong to the details screen.
    const legacyTab = searchParams.get("tab")
    if (legacyTab && legacyTab !== "aiChange") return <Navigate to={`/microfrontend/${id}/settings?tab=${encodeURIComponent(legacyTab)}`} replace />

    // Not an ApiStatusHandler: it unmounts its children on every background refetch, and the workspace holds a draft prompt.
    if (frontendQuery.isPending) {
        return (
            <div className="flex min-h-[200px] items-center justify-center">
                <Spinner size={32} />
            </div>
        )
    }

    if (frontendQuery.isError) {
        return (
            <Alert variant="destructive">
                <AlertDescription>{frontendQuery.error instanceof Error ? frontendQuery.error.message : t("app.error.generic")}</AlertDescription>
            </Alert>
        )
    }

    const microfrontend = frontendQuery.data
    if (!isAiEditAvailable(microfrontend, assistantEnabled)) return <Navigate to={`/microfrontend/${id}/settings`} replace />

    return (
        <div className="flex min-h-full flex-col gap-6">
            <MicrofrontendHeader microfrontend={microfrontend} active="ai" aiAvailable />
            {/* Keyed: the route instance is reused across microfrontends, and a draft must not follow the user to another one. */}
            <AiChangeWorkspace key={id} microfrontendId={id!} microfrontendName={microfrontend.name} />
        </div>
    )
}

export default MicrofrontendAiWorkspacePage
