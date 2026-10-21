import { Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Switch } from "@mfe-orchestrator/design-system"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms"
import type { ProjectPipelines, ProjectUpdateDTO } from "@/hooks/apiClients/useProjectApi"
import { choiceFrom, isChoiceValid, type RepositoryChoice, RepositoryPicker } from "./GitOpsSection"
import { SettingsDetails } from "./SettingsDetails"

export type PipelineTemplatesFormValues = ProjectUpdateDTO["pipelines"]

/** Stessa regola del backend: un nome di branch o di tag, senza "..", trattino iniziale, slash finale o ".lock" */
const GIT_REF_PATTERN = /^(?!-)(?!.*\.\.)(?!.*\/$)(?!.*\.lock$)[A-Za-z0-9._/-]{1,255}$/

interface PipelineTemplatesSectionProps {
    projectId: string
    pipelines?: ProjectPipelines
    onUpdate: (values: PipelineTemplatesFormValues) => void
    isUpdating: boolean
}

export const PipelineTemplatesSection: React.FC<PipelineTemplatesSectionProps> = ({ projectId, pipelines, onUpdate, isUpdating }) => {
    const { t } = useTranslation()

    const [enabled, setEnabled] = useState(false)
    const [choice, setChoice] = useState<RepositoryChoice>({ newName: "" })
    const [ref, setRef] = useState("")

    // Cambiare progetto lascia questa pagina montata, quindi lo stato deve seguire il nuovo progetto
    useEffect(() => {
        setEnabled(Boolean(pipelines?.codeRepository))
        setChoice(choiceFrom(pipelines?.codeRepository))
        setRef(pipelines?.ref ?? "")
    }, [pipelines])

    const refInvalid = ref.trim() !== "" && !GIT_REF_PATTERN.test(ref.trim())
    const canSave = !enabled || (isChoiceValid(choice) && !refInvalid)

    const buildValues = (): PipelineTemplatesFormValues => (enabled ? { codeRepositoryId: choice.codeRepositoryId!, repositoryId: choice.repositoryId!, ref: ref.trim() || null } : null)

    return (
        <Card className="pt-4">
            <CardHeader>
                <CardTitle as="h2">{t("settings.pipelines.title")}</CardTitle>
                <CardDescription>{t("settings.pipelines.subtitle")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 pt-4">
                <SettingsDetails summary={t("settings.howItWorks")} dataTestId="pipelines-details">
                    <p>{t("settings.pipelines.details")}</p>
                    <p>{t("settings.pipelines.layout")}</p>
                    <p>{t("settings.pipelines.placeholders")}</p>
                </SettingsDetails>

                <div className="flex items-center gap-3">
                    <Switch id="pipelines-enabled" checked={enabled} disabled={isUpdating} onCheckedChange={setEnabled} />
                    <Label htmlFor="pipelines-enabled">{t("settings.pipelines.enabled")}</Label>
                </div>

                {enabled && (
                    <>
                        <RepositoryPicker
                            id="pipelines"
                            label={t("settings.pipelines.repository")}
                            projectId={projectId}
                            defaultName=""
                            choice={choice}
                            onChange={setChoice}
                            saved={pipelines?.codeRepository}
                            disabled={isUpdating}
                            allowCreate={false}
                        />

                        <div className="flex flex-col gap-1">
                            <Label htmlFor="pipelines-ref">{t("settings.pipelines.ref")}</Label>
                            <Input
                                id="pipelines-ref"
                                value={ref}
                                placeholder={t("settings.pipelines.refPlaceholder")}
                                disabled={isUpdating}
                                aria-invalid={refInvalid}
                                aria-describedby="pipelines-ref-hint"
                                onChange={event => setRef(event.target.value)}
                                fullWidth
                            />
                            <span id="pipelines-ref-hint" className={refInvalid ? "text-xs text-destructive" : "text-xs text-foreground-secondary"}>
                                {t(refInvalid ? "settings.pipelines.refInvalid" : "settings.pipelines.refHint")}
                            </span>
                        </div>
                    </>
                )}

                <div className="flex justify-end">
                    <Button type="button" disabled={!canSave} loading={isUpdating} loadingLabel={t("common.loading")} dataTestId="pipelines-save" onClick={() => onUpdate(buildValues())}>
                        {t("common.save")}
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}

export default PipelineTemplatesSection
