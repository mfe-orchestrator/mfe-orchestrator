import { Alert, AlertDescription, AlertTitle, Textarea } from "@mfe-orchestrator/design-system"
import { Sparkles } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import useAssistantEnabled from "@/components/assistant/useAssistantEnabled"
import { Button } from "@/components/atoms"
import useAssistantApi, { ProjectDraft } from "@/hooks/apiClients/useAssistantApi"

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
    const enabled = useAssistantEnabled()
    const assistantApi = useAssistantApi()
    const [description, setDescription] = useState("")
    const [loading, setLoading] = useState(false)
    const [failed, setFailed] = useState(false)

    if (!enabled) return null

    const generate = async () => {
        if (!description.trim()) return
        setLoading(true)
        setFailed(false)
        try {
            onDraft(await assistantApi.draftProject(description.trim(), i18n.language))
        } catch {
            setFailed(true)
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
            {failed && <p className="text-sm text-destructive">{t("newProjectWizard.ai_draft.error")}</p>}
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
