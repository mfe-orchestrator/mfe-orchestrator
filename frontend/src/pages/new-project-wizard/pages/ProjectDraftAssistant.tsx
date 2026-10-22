import { Alert, AlertDescription, AlertTitle, Textarea } from "@mfe-orchestrator/design-system"
import { useQuery } from "@tanstack/react-query"
import { Sparkles } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms"
import useAiModelsApi, { AVAILABLE_AI_MODELS_QUERY_KEY } from "@/hooks/apiClients/useAiModelsApi"
import useAssistantApi, { ProjectDraft } from "@/hooks/apiClients/useAssistantApi"
import { errorCodeOf } from "@/hooks/useApiClient"
import useOrganizationStore from "@/store/useOrganizationStore"

const MAX_DESCRIPTION_CHARS = 4_000

interface ProjectDraftAssistantProps {
    draft?: ProjectDraft
    onDraft: (draft: ProjectDraft) => void
}

/**
 * Optional shortcut at the top of the first wizard step: the user describes the project in
 * their own words and the assistant prefills the name, the description and the environments.
 * Nothing is created from the draft; every step still has to be confirmed.
 */
const ProjectDraftAssistant: React.FC<ProjectDraftAssistantProps> = ({ draft, onDraft }) => {
    const { t, i18n } = useTranslation()
    const organizationId = useOrganizationStore(state => state.organization?._id)
    const aiModelsApi = useAiModelsApi()
    const assistantApi = useAssistantApi()
    const [description, setDescription] = useState("")
    const [loading, setLoading] = useState(false)
    // The key of the message of the last failure, if any.
    const [failed, setFailed] = useState<string>()

    // The project does not exist yet: the AIs are those of the organization it will belong to, and the draft takes its default.
    const availableQuery = useQuery({
        queryKey: [AVAILABLE_AI_MODELS_QUERY_KEY, "organization", organizationId],
        queryFn: () => aiModelsApi.availableForOrganization(organizationId!, { silent: true }),
        enabled: Boolean(organizationId)
    })
    const available = availableQuery.data

    if (!organizationId || !available || available.models.length === 0) return null

    const generate = async () => {
        if (!description.trim()) return
        setLoading(true)
        setFailed(undefined)
        try {
            onDraft(await assistantApi.draftProject(description.trim(), i18n.language, organizationId, available.defaultId))
        } catch (error) {
            const code = errorCodeOf(error as Error)
            setFailed(code === "RATE_LIMITED" ? "assistant.errors.rate_limited" : code === "AI_PROVIDER_ERROR" ? "newProjectWizard.ai_draft.provider_error" : "newProjectWizard.ai_draft.error")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="mb-6 flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4" data-testid="wizard-ai-draft">
            <div className="flex items-center gap-2">
                <Sparkles className="size-5 text-primary" aria-hidden="true" />
                <h3 className="font-semibold text-foreground">{t("newProjectWizard.ai_draft.title")}</h3>
            </div>
            <p className="text-sm text-foreground-secondary">{t("newProjectWizard.ai_draft.description")}</p>
            <Textarea
                value={description}
                maxLength={MAX_DESCRIPTION_CHARS}
                rows={3}
                placeholder={t("newProjectWizard.ai_draft.placeholder")}
                aria-label={t("newProjectWizard.ai_draft.title")}
                dataTestId="wizard-ai-draft-input"
                onChange={event => setDescription(event.target.value)}
            />
            <div>
                <Button type="button" variant="secondary" onClick={generate} disabled={!description.trim() || loading} dataTestId="wizard-ai-draft-submit">
                    <Sparkles />
                    {loading ? t("newProjectWizard.ai_draft.loading") : t("newProjectWizard.ai_draft.submit")}
                </Button>
            </div>
            {failed && <p className="text-sm text-destructive">{t(failed)}</p>}
            {draft && !failed && (
                <Alert className="border-primary/50" dataTestId="wizard-ai-draft-result">
                    <AlertTitle>{t("newProjectWizard.ai_draft.applied_title")}</AlertTitle>
                    <AlertDescription className="flex flex-col gap-1">
                        <span>{t("newProjectWizard.ai_draft.applied_environments", { environments: draft.environments.map(environment => environment.name).join(", ") })}</span>
                        {draft.storage !== "NONE" && <span>{t("newProjectWizard.ai_draft.suggested_storage", { storage: t(`newProjectWizard.ai_draft.storage.${draft.storage}`) })}</span>}
                        {draft.codeRepository !== "NONE" && (
                            <span>{t("newProjectWizard.ai_draft.suggested_repository", { repository: t(`newProjectWizard.ai_draft.repository.${draft.codeRepository}`) })}</span>
                        )}
                        {draft.notes && <span>{draft.notes}</span>}
                    </AlertDescription>
                </Alert>
            )}
        </div>
    )
}

export default ProjectDraftAssistant
