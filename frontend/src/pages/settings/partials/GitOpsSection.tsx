import {
    Alert,
    AlertDescription,
    AlertTitle,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
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
import type { ProjectGitOps, ProjectUpdateDTO } from "@/hooks/apiClients/useProjectApi"

export type GitOpsFormValues = NonNullable<ProjectUpdateDTO["gitOps"]>

interface GitOpsSectionProps {
    projectId: string
    gitOps?: ProjectGitOps
    onUpdate: (values: GitOpsFormValues) => void
    isUpdating: boolean
}

export const GitOpsSection: React.FC<GitOpsSectionProps> = ({ projectId, gitOps, onUpdate, isUpdating }) => {
    const { t } = useTranslation()
    const codeRepositoriesApi = useCodeRepositoriesApi()

    const [enabled, setEnabled] = useState(false)
    const [codeRepositoryId, setCodeRepositoryId] = useState<string>()
    const [repositoryId, setRepositoryId] = useState<string>()

    // Cambiare progetto lascia questa pagina montata, quindi lo stato deve seguire il nuovo progetto.
    useEffect(() => {
        setEnabled(Boolean(gitOps?.enabled))
        setCodeRepositoryId(gitOps?.codeRepository?.codeRepositoryId)
        setRepositoryId(gitOps?.codeRepository?.repositoryId)
    }, [gitOps])

    const connectionsQuery = useQuery({
        queryKey: ["code-repositories", projectId],
        queryFn: () => codeRepositoriesApi.getRepositoriesByProjectId(projectId),
        enabled: enabled && !!projectId
    })

    // Solo i repository che la connessione raggiunge davvero: il backend rifiuta tutti gli altri.
    const repositoriesQuery = useQuery({
        queryKey: ["importable-repositories", codeRepositoryId, "service"],
        queryFn: () => codeRepositoriesApi.getImportableRepositories(codeRepositoryId!, undefined, "service"),
        enabled: enabled && !!codeRepositoryId
    })

    const connections = connectionsQuery.data ?? []
    const repositories = repositoriesQuery.data ?? []
    const selectedConnection = connections.find(connection => connection._id === codeRepositoryId)
    const selectedRepositoryName =
        repositories.find(repository => repository.repositoryId === repositoryId)?.name ?? (repositoryId === gitOps?.codeRepository?.repositoryId ? gitOps?.codeRepository?.name : undefined)

    const canSave = !enabled || (!!codeRepositoryId && !!repositoryId)

    return (
        <Card className="pt-4">
            <CardHeader>
                <CardTitle as="h2">{t("settings.gitOps.title")}</CardTitle>
                <CardDescription>{t("settings.gitOps.subtitle")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 pt-4">
                <div className="flex items-center gap-3">
                    <Switch id="gitops-enabled" checked={enabled} disabled={isUpdating} onCheckedChange={setEnabled} />
                    <Label htmlFor="gitops-enabled">{t("settings.gitOps.enabled")}</Label>
                </div>

                {enabled && (
                    <>
                        {connectionsQuery.isSuccess && connections.length === 0 ? (
                            <Alert>
                                <AlertDescription>{t("settings.gitOps.noConnections")}</AlertDescription>
                            </Alert>
                        ) : (
                            <div className="grid gap-4 md:grid-cols-2">
                                <SelectControl label={t("settings.gitOps.connection")}>
                                    <Select
                                        value={codeRepositoryId}
                                        disabled={isUpdating}
                                        onValueChange={value => {
                                            setCodeRepositoryId(value)
                                            setRepositoryId(undefined)
                                        }}
                                    >
                                        <SelectTrigger dataTestId="gitops-connection">
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
                                    <Select value={repositoryId} onValueChange={setRepositoryId} disabled={isUpdating || !codeRepositoryId || repositoriesQuery.isLoading}>
                                        <SelectTrigger dataTestId="gitops-repository">
                                            <SelectValue placeholder={t("settings.gitOps.repositoryPlaceholder")}>{selectedRepositoryName}</SelectValue>
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
                        )}

                        <Alert variant="destructive">
                            <AlertTitle>{t("settings.gitOps.secretsWarningTitle")}</AlertTitle>
                            <AlertDescription>{t("settings.gitOps.secretsWarning")}</AlertDescription>
                        </Alert>

                        <p className="text-sm text-muted-foreground">{t("settings.gitOps.exportHint")}</p>
                    </>
                )}

                <div className="flex justify-end">
                    <Button
                        type="button"
                        disabled={!canSave}
                        loading={isUpdating}
                        loadingLabel={t("common.loading")}
                        dataTestId="gitops-save"
                        onClick={() => onUpdate(enabled ? { enabled, codeRepositoryId, repositoryId } : { enabled })}
                    >
                        {t("common.save")}
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}

export default GitOpsSection
