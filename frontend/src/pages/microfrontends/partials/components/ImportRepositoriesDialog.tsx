import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CircleCheck, DownloadCloud, Loader2, Search, X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Badge, Button } from "@/components/atoms"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input/input"
import { SelectContent } from "@/components/ui/select/partials/selectContent/selectContent"
import { SelectItem } from "@/components/ui/select/partials/selectItem/selectItem"
import { SelectTrigger } from "@/components/ui/select/partials/selectTrigger/selectTrigger"
import { Select, SelectValue } from "@/components/ui/select/select"
import useCodeRepositoriesApi, { ICodeRepository } from "@/hooks/apiClients/useCodeRepositoriesApi"
import useProjectStore from "@/store/useProjectStore"
import useToastNotificationStore from "@/store/useToastNotificationStore"

interface ImportRepositoriesDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** Code repository connections configured on the project (GitHub account/org, GitLab group, Azure DevOps project). */
    codeRepositories: ICodeRepository[]
}

export const ImportRepositoriesDialog: React.FC<ImportRepositoriesDialogProps> = ({ open, onOpenChange, codeRepositories }) => {
    const { t } = useTranslation()
    const codeRepositoriesApi = useCodeRepositoriesApi()
    const notifications = useToastNotificationStore()
    const queryClient = useQueryClient()
    const projectId = useProjectStore().project?._id

    const defaultCodeRepositoryId = useMemo(() => codeRepositories.find(repository => repository.default)?._id ?? codeRepositories[0]?._id, [codeRepositories])

    const [codeRepositoryId, setCodeRepositoryId] = useState<string | undefined>(defaultCodeRepositoryId)
    const [selectedRepositoryIds, setSelectedRepositoryIds] = useState<string[]>([])
    const [searchTerm, setSearchTerm] = useState("")

    // The dialog is kept mounted by the page, so every fresh opening has to start from a clean selection.
    useEffect(() => {
        if (!open) return
        setCodeRepositoryId(defaultCodeRepositoryId)
        setSelectedRepositoryIds([])
        setSearchTerm("")
    }, [open, defaultCodeRepositoryId])

    const repositoriesQuery = useQuery({
        queryKey: ["importable-repositories", codeRepositoryId],
        queryFn: () => codeRepositoriesApi.getImportableRepositories(codeRepositoryId!),
        enabled: open && !!codeRepositoryId
    })

    const repositories = repositoriesQuery.data ?? []
    const importableRepositories = useMemo(() => repositories.filter(repository => !repository.alreadyImported), [repositories])

    const visibleRepositories = useMemo(() => {
        if (!searchTerm) return repositories
        const term = searchTerm.toLowerCase()
        return repositories.filter(repository => repository.name.toLowerCase().includes(term))
    }, [repositories, searchTerm])

    const selectableVisibleIds = useMemo(() => visibleRepositories.filter(repository => !repository.alreadyImported).map(repository => repository.repositoryId), [visibleRepositories])

    const allVisibleSelected = selectableVisibleIds.length > 0 && selectableVisibleIds.every(id => selectedRepositoryIds.includes(id))

    const toggleRepository = (repositoryId: string) => {
        setSelectedRepositoryIds(current => (current.includes(repositoryId) ? current.filter(id => id !== repositoryId) : [...current, repositoryId]))
    }

    const toggleAllVisible = () => {
        setSelectedRepositoryIds(current => (allVisibleSelected ? current.filter(id => !selectableVisibleIds.includes(id)) : [...new Set([...current, ...selectableVisibleIds])]))
    }

    const importMutation = useMutation({
        mutationFn: () => codeRepositoriesApi.importRepositories(codeRepositoryId!, { repositoryIds: selectedRepositoryIds }),
        onSuccess: async result => {
            if (result.imported.length > 0) {
                notifications.showSuccessNotification({
                    message: t("microfrontend.import.importedCount", { count: result.imported.length })
                })
            }

            if (result.failed.length > 0) {
                notifications.showErrorNotification({
                    message: t("microfrontend.import.failedCount", {
                        count: result.failed.length,
                        names: result.failed.map(failure => failure.name).join(", ")
                    })
                })
            }

            if (result.imported.length === 0 && result.failed.length === 0) {
                notifications.showInfoNotification({ message: t("microfrontend.import.nothingImported") })
            }

            await queryClient.invalidateQueries({ queryKey: ["microfrontends-by-project-id", projectId] })

            if (result.failed.length === 0) {
                onOpenChange(false)
            } else {
                await repositoriesQuery.refetch()
                setSelectedRepositoryIds([])
            }
        }
    })

    const selectedCodeRepository = codeRepositories.find(repository => repository._id === codeRepositoryId)

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{t("microfrontend.import.title")}</DialogTitle>
                    <DialogDescription>{t("microfrontend.import.description")}</DialogDescription>
                </DialogHeader>

                <div className="mt-2 flex flex-col gap-3">
                    {codeRepositories.length > 1 && (
                        <div className="flex flex-col gap-1">
                            <span className="text-sm font-medium text-foreground-secondary">{t("microfrontend.sourceCodeProvider")}</span>
                            <Select
                                value={codeRepositoryId}
                                onValueChange={value => {
                                    setCodeRepositoryId(value)
                                    setSelectedRepositoryIds([])
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue>{selectedCodeRepository?.name}</SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                    {codeRepositories.map(repository => (
                                        <SelectItem key={repository._id} value={repository._id}>
                                            {repository.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {repositoriesQuery.isPending ? (
                        <div className="flex items-center justify-center gap-2 py-10 text-sm text-foreground-secondary">
                            <Loader2 className="size-4 animate-spin" />
                            {t("microfrontend.import.loading")}
                        </div>
                    ) : repositoriesQuery.isError ? (
                        <Alert variant="destructive">
                            <AlertDescription>{t("microfrontend.import.loadError")}</AlertDescription>
                        </Alert>
                    ) : repositories.length === 0 ? (
                        <Alert>
                            <AlertDescription>{t("microfrontend.import.noRepositories")}</AlertDescription>
                        </Alert>
                    ) : (
                        <>
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-secondary" aria-hidden="true" />
                                <Input placeholder={t("microfrontend.import.searchPlaceholder")} className="pl-9 pr-9" fullWidth value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                                {searchTerm && (
                                    <button
                                        type="button"
                                        onClick={() => setSearchTerm("")}
                                        aria-label={t("microfrontend.dashboard.clearSearch")}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-foreground-secondary transition-colors hover:bg-primary/15 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                        <X className="size-4" />
                                    </button>
                                )}
                            </div>

                            <div className="flex items-center justify-between gap-2">
                                <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground-secondary">
                                    <Checkbox checked={allVisibleSelected} disabled={selectableVisibleIds.length === 0} onCheckedChange={toggleAllVisible} />
                                    {t("microfrontend.import.selectAll")}
                                </label>
                                <span className="text-sm text-foreground-secondary">
                                    {t("microfrontend.import.selectedCount", { count: selectedRepositoryIds.length, total: importableRepositories.length })}
                                </span>
                            </div>

                            <ul className="max-h-80 divide-y divide-divider overflow-y-auto rounded-md border border-divider">
                                {visibleRepositories.map(repository => {
                                    const checked = selectedRepositoryIds.includes(repository.repositoryId)

                                    return (
                                        <li key={repository.repositoryId}>
                                            <label className={`flex items-start gap-3 px-3 py-2 ${repository.alreadyImported ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-primary/5"}`}>
                                                <Checkbox
                                                    className="mt-1"
                                                    checked={repository.alreadyImported || checked}
                                                    disabled={repository.alreadyImported}
                                                    onCheckedChange={() => toggleRepository(repository.repositoryId)}
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="truncate font-medium text-foreground">{repository.name}</span>
                                                        {repository.alreadyImported ? (
                                                            <Badge variant="accent">
                                                                <CircleCheck className="size-3" />
                                                                {t("microfrontend.import.alreadyImported")}
                                                            </Badge>
                                                        ) : (
                                                            <span className="text-xs text-foreground-secondary">{repository.slug}</span>
                                                        )}
                                                    </div>
                                                    {repository.description && <p className="truncate text-sm text-foreground-secondary">{repository.description}</p>}
                                                </div>
                                            </label>
                                        </li>
                                    )
                                })}
                                {visibleRepositories.length === 0 && <li className="px-3 py-6 text-center text-sm text-foreground-secondary">{t("microfrontend.import.noSearchResults")}</li>}
                            </ul>
                        </>
                    )}
                </div>

                <DialogFooter>
                    <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={importMutation.isPending}>
                        {t("common.cancel")}
                    </Button>
                    <Button type="button" onClick={() => importMutation.mutate()} disabled={importMutation.isPending || selectedRepositoryIds.length === 0}>
                        {importMutation.isPending ? <Loader2 className="animate-spin" /> : <DownloadCloud />}
                        {t("microfrontend.import.import", { count: selectedRepositoryIds.length })}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

export default ImportRepositoriesDialog
