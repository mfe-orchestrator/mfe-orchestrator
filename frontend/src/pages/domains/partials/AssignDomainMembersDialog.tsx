import { Alert, AlertDescription, Checkbox, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, SearchInput } from "@mfe-orchestrator/design-system"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Badge, Button } from "@/components/atoms"
import useDomainsApi from "@/hooks/apiClients/useDomainsApi"
import useProjectStore from "@/store/useProjectStore"
import useToastNotificationStore from "@/store/useToastNotificationStore"

export type DomainMemberKind = "microfrontend" | "service"

/** A microfrontend or a service of the project that is not in the domain yet */
export interface DomainMemberCandidate {
    _id: string
    name: string
    slug: string
    domainId?: string | null
}

interface AssignDomainMembersDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    kind: DomainMemberKind
    domainId: string
    candidates: DomainMemberCandidate[]
}

export const AssignDomainMembersDialog: React.FC<AssignDomainMembersDialogProps> = ({ open, onOpenChange, kind, domainId, candidates }) => {
    const { t } = useTranslation()
    const domainsApi = useDomainsApi()
    const notifications = useToastNotificationStore()
    const queryClient = useQueryClient()
    const projectId = useProjectStore(state => state.project?._id)
    const [selectedIds, setSelectedIds] = useState<string[]>([])
    const [searchTerm, setSearchTerm] = useState("")

    // Kept mounted by the page, so every opening starts from a clean selection.
    useEffect(() => {
        if (!open) return
        setSelectedIds([])
        setSearchTerm("")
    }, [open])

    // Only to name the domain a candidate would be moved out of
    const domainsQuery = useQuery({ queryKey: ["domains", projectId], queryFn: domainsApi.getAll, enabled: open && !!projectId })
    const domainNames = useMemo(() => new Map((domainsQuery.data ?? []).map(domain => [domain._id, domain.name])), [domainsQuery.data])

    const visibleCandidates = useMemo(() => {
        const term = searchTerm.trim().toLowerCase()
        if (!term) return candidates
        return candidates.filter(candidate => candidate.name.toLowerCase().includes(term) || candidate.slug.toLowerCase().includes(term))
    }, [candidates, searchTerm])

    const visibleIds = visibleCandidates.map(candidate => candidate._id)
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.includes(id))

    const toggle = (id: string) => setSelectedIds(current => (current.includes(id) ? current.filter(selected => selected !== id) : [...current, id]))
    const toggleAllVisible = () => setSelectedIds(current => (allVisibleSelected ? current.filter(id => !visibleIds.includes(id)) : [...new Set([...current, ...visibleIds])]))

    const assignMutation = useMutation({
        mutationFn: () => domainsApi.addMembers(domainId, kind === "service" ? { serviceIds: selectedIds } : { microfrontendIds: selectedIds }),
        onSuccess: async result => {
            notifications.showSuccessNotification({
                message: t(`domains.members.assigned_${kind}`, { count: kind === "service" ? result.services : result.microfrontends })
            })
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: kind === "service" ? ["services"] : ["microfrontends-by-project-id"] }),
                queryClient.invalidateQueries({ queryKey: ["domains"] })
            ])
            onOpenChange(false)
        }
    })

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{t(`domains.members.assign_title_${kind}`)}</DialogTitle>
                    <DialogDescription>{t(`domains.members.assign_description_${kind}`)}</DialogDescription>
                </DialogHeader>

                <div className="mt-2 flex flex-col gap-3">
                    {candidates.length === 0 ? (
                        <Alert>
                            <AlertDescription>{t(`domains.members.empty_${kind}`)}</AlertDescription>
                        </Alert>
                    ) : (
                        <>
                            <SearchInput
                                placeholder={t("domains.members.search_placeholder")}
                                value={searchTerm}
                                onValueChange={setSearchTerm}
                                onClear={() => setSearchTerm("")}
                                clearLabel={t("domains.members.clear_search")}
                            />

                            <div className="flex items-center justify-between gap-2">
                                <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground-secondary">
                                    <Checkbox checked={allVisibleSelected} disabled={visibleIds.length === 0} onCheckedChange={toggleAllVisible} />
                                    {t("domains.members.select_all")}
                                </label>
                                <span className="text-sm text-foreground-secondary">{t("domains.members.selected_count", { count: selectedIds.length, total: candidates.length })}</span>
                            </div>

                            <ul className="max-h-80 divide-y divide-divider overflow-y-auto rounded-md border border-divider">
                                {visibleCandidates.map(candidate => {
                                    const currentDomain = candidate.domainId ? domainNames.get(candidate.domainId) : undefined
                                    return (
                                        <li key={candidate._id}>
                                            <label className="flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-primary/5">
                                                <Checkbox className="mt-1" checked={selectedIds.includes(candidate._id)} onCheckedChange={() => toggle(candidate._id)} />
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="truncate font-medium text-foreground">{candidate.name}</span>
                                                        {currentDomain && <Badge variant="accent">{t("domains.members.in_domain", { name: currentDomain })}</Badge>}
                                                    </div>
                                                    <p className="truncate text-sm text-foreground-secondary">{candidate.slug}</p>
                                                </div>
                                            </label>
                                        </li>
                                    )
                                })}
                                {visibleCandidates.length === 0 && <li className="px-3 py-6 text-center text-sm text-foreground-secondary">{t("domains.members.no_search_results")}</li>}
                            </ul>
                        </>
                    )}
                </div>

                <DialogFooter>
                    <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={assignMutation.isPending}>
                        {t("common.cancel")}
                    </Button>
                    <Button type="button" onClick={() => assignMutation.mutate()} loading={assignMutation.isPending} loadingLabel={t("common.loading")} disabled={selectedIds.length === 0}>
                        {!assignMutation.isPending && <Link2 />}
                        {t("domains.members.confirm", { count: selectedIds.length })}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

export default AssignDomainMembersDialog
