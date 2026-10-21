import {
    Alert,
    AlertDescription,
    AlertTitle,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Checkbox,
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
import type { ProjectGitOps, ProjectGitOpsRepository, ProjectUpdateDTO } from "@/hooks/apiClients/useProjectApi"
import { SettingsDetails } from "./SettingsDetails"

export type GitOpsFormValues = NonNullable<ProjectUpdateDTO["gitOps"]>

/** Valore sentinella della select: non e' un id di repository del provider */
const NEW_REPOSITORY = "__new__"

/** Stessa regola del backend per il nome di un repository da creare */
const REPOSITORY_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/
const isValidRepositoryName = (name: string) => REPOSITORY_NAME_PATTERN.test(name) && !/(\.|\.git|\.atom)$/i.test(name)

export interface RepositoryChoice {
    codeRepositoryId?: string
    /** Id del repository esistente, oppure NEW_REPOSITORY */
    repositoryId?: string
    newName: string
}

export const choiceFrom = (repository?: ProjectGitOpsRepository): RepositoryChoice => ({
    codeRepositoryId: repository?.codeRepositoryId,
    repositoryId: repository?.repositoryId,
    newName: ""
})

export const isChoiceValid = (choice: RepositoryChoice) => !!choice.codeRepositoryId && (choice.repositoryId === NEW_REPOSITORY ? isValidRepositoryName(choice.newName) : !!choice.repositoryId)

const choiceToDTO = (choice: RepositoryChoice) => ({
    codeRepositoryId: choice.codeRepositoryId!,
    ...(choice.repositoryId === NEW_REPOSITORY ? { newRepositoryName: choice.newName } : { repositoryId: choice.repositoryId })
})

interface RepositoryPickerProps {
    id: string
    label: string
    projectId: string
    defaultName: string
    choice: RepositoryChoice
    onChange: (choice: RepositoryChoice) => void
    /** Il repository gia salvato sul progetto: il nome da mostrare finche' l'elenco non lo contiene */
    saved?: ProjectGitOpsRepository
    disabled: boolean
    /** False per scegliere solo tra i repository esistenti: niente voce "crea un nuovo repository" */
    allowCreate?: boolean
}

export const RepositoryPicker: React.FC<RepositoryPickerProps> = ({ id, label, projectId, defaultName, choice, onChange, saved, disabled, allowCreate = true }) => {
    const { t } = useTranslation()
    const codeRepositoriesApi = useCodeRepositoriesApi()

    const connectionsQuery = useQuery({
        queryKey: ["code-repositories", projectId],
        queryFn: () => codeRepositoriesApi.getRepositoriesByProjectId(projectId),
        enabled: !!projectId
    })

    // Solo i repository che la connessione raggiunge davvero: il backend rifiuta tutti gli altri.
    const repositoriesQuery = useQuery({
        queryKey: ["importable-repositories", choice.codeRepositoryId, "service"],
        queryFn: () => codeRepositoriesApi.getImportableRepositories(choice.codeRepositoryId!, undefined, "service"),
        enabled: !!choice.codeRepositoryId
    })

    const connections = connectionsQuery.data ?? []
    const repositories = repositoriesQuery.data ?? []
    const isNew = choice.repositoryId === NEW_REPOSITORY
    const selectedConnection = connections.find(connection => connection._id === choice.codeRepositoryId)
    const selectedRepositoryName = isNew
        ? t("settings.gitOps.createRepository")
        : (repositories.find(repository => repository.repositoryId === choice.repositoryId)?.name ?? (choice.repositoryId === saved?.repositoryId ? saved?.name : undefined))
    const nameInvalid = isNew && !isValidRepositoryName(choice.newName)

    if (connectionsQuery.isSuccess && connections.length === 0) {
        return (
            <Alert>
                <AlertDescription>{t("settings.gitOps.noConnections")}</AlertDescription>
            </Alert>
        )
    }

    return (
        <div className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">{label}</h3>
            <div className="grid gap-4 md:grid-cols-2">
                <SelectControl label={t("settings.gitOps.connection")}>
                    <Select value={choice.codeRepositoryId} disabled={disabled} onValueChange={value => onChange({ ...choice, codeRepositoryId: value, repositoryId: undefined })}>
                        <SelectTrigger dataTestId={`${id}-connection`}>
                            <SelectValue placeholder={t("settings.gitOps.connectionPlaceholder")}>{selectedConnection?.name}</SelectValue>
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

                <SelectControl label={t("settings.gitOps.repository")}>
                    <Select
                        value={choice.repositoryId}
                        onValueChange={value => onChange({ ...choice, repositoryId: value, newName: value === NEW_REPOSITORY && !choice.newName ? defaultName : choice.newName })}
                        disabled={disabled || !choice.codeRepositoryId || repositoriesQuery.isLoading}
                    >
                        <SelectTrigger dataTestId={`${id}-repository`}>
                            <SelectValue placeholder={t("settings.gitOps.repositoryPlaceholder")}>{selectedRepositoryName}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            {allowCreate && <SelectItem value={NEW_REPOSITORY}>{t("settings.gitOps.createRepository")}</SelectItem>}
                            {repositories.map(repository => (
                                <SelectItem key={repository.repositoryId} value={repository.repositoryId}>
                                    {repository.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </SelectControl>
            </div>

            {isNew && (
                <div className="flex flex-col gap-1">
                    <Label htmlFor={`${id}-new-name`}>{t("settings.gitOps.newRepositoryName")}</Label>
                    <Input
                        id={`${id}-new-name`}
                        value={choice.newName}
                        disabled={disabled}
                        aria-invalid={nameInvalid}
                        aria-describedby={`${id}-new-name-hint`}
                        onChange={event => onChange({ ...choice, newName: event.target.value })}
                        fullWidth
                    />
                    <span id={`${id}-new-name-hint`} className={nameInvalid ? "text-xs text-destructive" : "text-xs text-foreground-secondary"}>
                        {t(nameInvalid ? "settings.gitOps.newRepositoryInvalid" : "settings.gitOps.newRepositoryHint")}
                    </span>
                </div>
            )}
        </div>
    )
}

interface GitOpsSectionProps {
    projectId: string
    projectSlug: string
    gitOps?: ProjectGitOps
    onUpdate: (values: GitOpsFormValues) => void
    isUpdating: boolean
}

export const GitOpsSection: React.FC<GitOpsSectionProps> = ({ projectId, projectSlug, gitOps, onUpdate, isUpdating }) => {
    const { t } = useTranslation()

    const [enabled, setEnabled] = useState(false)
    const [config, setConfig] = useState<RepositoryChoice>({ newName: "" })
    const [applicationsEnabled, setApplicationsEnabled] = useState(false)
    const [applications, setApplications] = useState<RepositoryChoice>({ newName: "" })

    // Cambiare progetto lascia questa pagina montata, quindi lo stato deve seguire il nuovo progetto.
    // Dopo un salvataggio con un repository nuovo, gitOps contiene quello creato: torna selezionato.
    useEffect(() => {
        setEnabled(Boolean(gitOps?.enabled))
        setConfig(choiceFrom(gitOps?.codeRepository))
        setApplicationsEnabled(Boolean(gitOps?.applicationsCodeRepository))
        setApplications(choiceFrom(gitOps?.applicationsCodeRepository))
    }, [gitOps])

    const canSave = !enabled || (isChoiceValid(config) && (!applicationsEnabled || isChoiceValid(applications)))

    const buildValues = (): GitOpsFormValues => (enabled ? { enabled, ...choiceToDTO(config), applications: applicationsEnabled ? choiceToDTO(applications) : null } : { enabled })

    return (
        <Card className="pt-4">
            <CardHeader>
                <CardTitle as="h2">{t("settings.gitOps.title")}</CardTitle>
                <CardDescription>{t("settings.gitOps.subtitle")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 pt-4">
                <SettingsDetails summary={t("settings.howItWorks")} dataTestId="gitops-details">
                    <p>{t("settings.gitOps.details")}</p>
                </SettingsDetails>

                <div className="flex items-center gap-3">
                    <Switch id="gitops-enabled" checked={enabled} disabled={isUpdating} onCheckedChange={setEnabled} />
                    <Label htmlFor="gitops-enabled">{t("settings.gitOps.enabled")}</Label>
                </div>

                {enabled && (
                    <>
                        <RepositoryPicker
                            id="gitops"
                            label={t("settings.gitOps.configRepository")}
                            projectId={projectId}
                            defaultName={`${projectSlug}-config-infra`}
                            choice={config}
                            onChange={setConfig}
                            saved={gitOps?.codeRepository}
                            disabled={isUpdating}
                        />

                        <div className="flex flex-col gap-3">
                            <div className="flex items-center gap-3">
                                <Checkbox
                                    id="gitops-applications-enabled"
                                    checked={applicationsEnabled}
                                    disabled={isUpdating}
                                    onCheckedChange={checked => setApplicationsEnabled(checked === true)}
                                    dataTestId="gitops-applications-enabled"
                                />
                                <Label htmlFor="gitops-applications-enabled">{t("settings.gitOps.applicationsEnabled")}</Label>
                            </div>
                            <p className="text-sm text-muted-foreground">{t("settings.gitOps.applicationsDescription")}</p>
                            {applicationsEnabled && (
                                <RepositoryPicker
                                    id="gitops-applications"
                                    label={t("settings.gitOps.applicationsRepository")}
                                    projectId={projectId}
                                    defaultName={`${projectSlug}-applications-infra`}
                                    choice={applications}
                                    onChange={setApplications}
                                    saved={gitOps?.applicationsCodeRepository}
                                    disabled={isUpdating}
                                />
                            )}
                        </div>

                        <Alert variant="destructive">
                            <AlertTitle>{t("settings.gitOps.secretsWarningTitle")}</AlertTitle>
                            <AlertDescription>{t("settings.gitOps.secretsWarning")}</AlertDescription>
                        </Alert>

                        <p className="text-sm text-muted-foreground">{t("settings.gitOps.deployHint")}</p>
                    </>
                )}

                <div className="flex justify-end">
                    <Button type="button" disabled={!canSave} loading={isUpdating} loadingLabel={t("common.loading")} dataTestId="gitops-save" onClick={() => onUpdate(buildValues())}>
                        {t("common.save")}
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}

export default GitOpsSection
