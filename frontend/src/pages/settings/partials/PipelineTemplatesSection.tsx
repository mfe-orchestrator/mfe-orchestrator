import {
    Alert,
    AlertDescription,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Input,
    Label,
    Select,
    SelectContent,
    SelectControl,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Switch
} from "@mfe-orchestrator/design-system"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms"
import useCodeRepositoriesApi from "@/hooks/apiClients/useCodeRepositoriesApi"
import type { ProjectPipelines, ProjectPipelinesRepository, ProjectUpdateDTO } from "@/hooks/apiClients/useProjectApi"
import { SettingsDetails } from "./SettingsDetails"

export type PipelineTemplatesFormValues = ProjectUpdateDTO["pipelines"]

/** Stessa regola del backend: un nome di branch o di tag, senza "..", trattino iniziale, slash finale o ".lock" */
const GIT_REF_PATTERN = /^(?!-)(?!.*\.\.)(?!.*\/$)(?!.*\.lock$)[A-Za-z0-9._/-]{1,255}$/

interface RepositoryChoice {
    codeRepositoryId?: string
    repositoryId?: string
}

const choiceFrom = (repository?: ProjectPipelinesRepository): RepositoryChoice => ({ codeRepositoryId: repository?.codeRepositoryId, repositoryId: repository?.repositoryId })

interface RepositoryPickerProps {
    projectId: string
    choice: RepositoryChoice
    onChange: (choice: RepositoryChoice) => void
    /** Il repository gia salvato sul progetto: il nome da mostrare finche' l'elenco non lo contiene */
    saved?: ProjectPipelinesRepository
    disabled: boolean
}

/** La connessione e, tra i repository che raggiunge, quello delle pipeline */
const RepositoryPicker: React.FC<RepositoryPickerProps> = ({ projectId, choice, onChange, saved, disabled }) => {
    const { t } = useTranslation()
    const codeRepositoriesApi = useCodeRepositoriesApi()

    const connectionsQuery = useQuery({
        queryKey: ["code-repositories", projectId],
        queryFn: () => codeRepositoriesApi.getRepositoriesByProjectId(projectId),
        enabled: !!projectId
    })

    // Solo i repository che la connessione raggiunge davvero: il backend rifiuta tutti gli altri.
    const repositoriesQuery = useQuery({
        queryKey: ["importable-repositories", choice.codeRepositoryId],
        queryFn: () => codeRepositoriesApi.getImportableRepositories(choice.codeRepositoryId!),
        enabled: !!choice.codeRepositoryId
    })

    const connections = connectionsQuery.data ?? []
    const repositories = repositoriesQuery.data ?? []
    const selectedConnection = connections.find(connection => connection._id === choice.codeRepositoryId)
    const selectedRepositoryName = repositories.find(repository => repository.repositoryId === choice.repositoryId)?.name ?? (choice.repositoryId === saved?.repositoryId ? saved?.name : undefined)

    if (connectionsQuery.isSuccess && connections.length === 0) {
        return (
            <Alert>
                <AlertDescription>{t("settings.pipelines.noConnections")}</AlertDescription>
            </Alert>
        )
    }

    return (
        <div className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">{t("settings.pipelines.repository")}</h3>
            <div className="grid gap-4 md:grid-cols-2">
                <SelectControl label={t("settings.pipelines.connection")}>
                    <Select value={choice.codeRepositoryId} disabled={disabled} onValueChange={value => onChange({ codeRepositoryId: value, repositoryId: undefined })}>
                        <SelectTrigger dataTestId="pipelines-connection">
                            <SelectValue placeholder={t("settings.pipelines.connectionPlaceholder")}>{selectedConnection?.name}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            {connections.map(connection => (
                                <SelectItem key={connection._id} value={connection._id}>
                                    {connection.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </SelectControl>

                <SelectControl label={t("settings.pipelines.repositoryLabel")}>
                    <Select
                        value={choice.repositoryId}
                        onValueChange={value => onChange({ ...choice, repositoryId: value })}
                        disabled={disabled || !choice.codeRepositoryId || repositoriesQuery.isLoading}
                    >
                        <SelectTrigger dataTestId="pipelines-repository">
                            <SelectValue placeholder={t("settings.pipelines.repositoryPlaceholder")}>{selectedRepositoryName}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            {repositories.map(repository => (
                                <SelectItem key={repository.repositoryId} value={repository.repositoryId}>
                                    {repository.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </SelectControl>
            </div>
        </div>
    )
}

interface PipelineTemplatesSectionProps {
    projectId: string
    pipelines?: ProjectPipelines
    onUpdate: (values: PipelineTemplatesFormValues) => void
    isUpdating: boolean
}

export const PipelineTemplatesSection: React.FC<PipelineTemplatesSectionProps> = ({ projectId, pipelines, onUpdate, isUpdating }) => {
    const { t } = useTranslation()

    const [enabled, setEnabled] = useState(false)
    const [choice, setChoice] = useState<RepositoryChoice>({})
    const [ref, setRef] = useState("")

    // Cambiare progetto lascia questa pagina montata, quindi lo stato deve seguire il nuovo progetto
    useEffect(() => {
        setEnabled(Boolean(pipelines?.codeRepository))
        setChoice(choiceFrom(pipelines?.codeRepository))
        setRef(pipelines?.ref ?? "")
    }, [pipelines])

    const refInvalid = ref.trim() !== "" && !GIT_REF_PATTERN.test(ref.trim())
    const canSave = !enabled || (!!choice.codeRepositoryId && !!choice.repositoryId && !refInvalid)

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
                        <RepositoryPicker projectId={projectId} choice={choice} onChange={setChoice} saved={pipelines?.codeRepository} disabled={isUpdating} />

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
