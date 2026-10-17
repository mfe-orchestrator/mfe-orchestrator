import { Card, CardContent, CardFooter, CardHeader, CardTitle, EmptyState } from "@mfe-orchestrator/design-system"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CirclePlus, FolderOpen, LayoutDashboard, Pencil, Server, Trash2 } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/atoms"
import { ApiStatusHandler } from "@/components/organisms"
import SinglePageLayout from "@/components/SinglePageLayout"
import { DeleteConfirmationDialog } from "@/components/ui/DeleteConfirmationDialog"
import useDomainsApi, { Domain } from "@/hooks/apiClients/useDomainsApi"
import useProjectStore from "@/store/useProjectStore"
import DomainFormDialog from "./partials/DomainFormDialog"

const Domains = () => {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const projectId = useProjectStore(state => state.project?._id)
    const domainsApi = useDomainsApi()

    const [isFormOpen, setIsFormOpen] = useState(false)
    const [editedDomain, setEditedDomain] = useState<Domain | undefined>()
    const [domainToDelete, setDomainToDelete] = useState<Domain | null>(null)

    const domainsQuery = useQuery({
        queryKey: ["domains", projectId],
        queryFn: domainsApi.getAll,
        enabled: !!projectId
    })

    const deleteMutation = useMutation({
        mutationFn: domainsApi.deleteSingle,
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["domains"] })
            await queryClient.invalidateQueries({ queryKey: ["services"] })
            await queryClient.invalidateQueries({ queryKey: ["microfrontends-by-project-id"] })
        }
    })

    const openForm = (domain?: Domain) => {
        setEditedDomain(domain)
        setIsFormOpen(true)
    }

    const domains = domainsQuery.data ?? []

    return (
        <>
            <SinglePageLayout
                title={t("domains.title")}
                description={t("domains.description")}
                right={
                    domains.length > 0 && (
                        <Button variant="primary" onClick={() => openForm()} dataTestId="domain-create">
                            <CirclePlus />
                            {t("domains.add_new")}
                        </Button>
                    )
                }
            >
                <ApiStatusHandler queries={[domainsQuery]}>
                    {domains.length === 0 ? (
                        <EmptyState
                            variant="outlined"
                            size="lg"
                            tone="primary"
                            icon={<FolderOpen />}
                            title={t("domains.empty_title")}
                            description={t("domains.empty_description")}
                            actions={
                                <Button onClick={() => openForm()}>
                                    <CirclePlus />
                                    {t("domains.add_new")}
                                </Button>
                            }
                        />
                    ) : (
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-4">
                            {domains.map(domain => (
                                <Card key={domain._id} className="flex h-full flex-col transition-colors duration-200 hover:border-primary" data-testid={`domain-card-${domain.slug}`}>
                                    <CardHeader>
                                        <CardTitle className="mb-0 truncate" title={domain.name}>
                                            {domain.name}
                                        </CardTitle>
                                        <p className="truncate text-sm text-foreground-secondary" title={domain.slug}>
                                            {domain.slug}
                                        </p>
                                    </CardHeader>
                                    <CardContent className="flex flex-grow flex-col gap-3 py-3 text-sm">
                                        {domain.description && <p className="line-clamp-3 text-foreground-secondary">{domain.description}</p>}
                                        <div className="flex flex-wrap gap-4">
                                            <span className="flex items-center gap-1.5">
                                                <LayoutDashboard className="size-4" aria-hidden="true" />
                                                {t("domains.frontend_count", { count: domain.microfrontendsCount ?? 0 })}
                                            </span>
                                            <span className="flex items-center gap-1.5">
                                                <Server className="size-4" aria-hidden="true" />
                                                {t("domains.backend_count", { count: domain.servicesCount ?? 0 })}
                                            </span>
                                        </div>
                                    </CardContent>
                                    <CardFooter className="gap-2 border-t border-divider pt-3">
                                        <Button variant="primary" size="sm" className="flex-1" onClick={() => navigate(`/domain/${domain._id}`)}>
                                            {t("domains.open")}
                                        </Button>
                                        <Button variant="ghost" size="icon" aria-label={t("common.edit")} title={t("common.edit")} onClick={() => openForm(domain)}>
                                            <Pencil />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            aria-label={t("common.delete")}
                                            title={t("common.delete")}
                                            disabled={deleteMutation.isPending}
                                            onClick={() => setDomainToDelete(domain)}
                                        >
                                            <Trash2 className="text-destructive" />
                                        </Button>
                                    </CardFooter>
                                </Card>
                            ))}
                        </div>
                    )}
                </ApiStatusHandler>
            </SinglePageLayout>
            <DomainFormDialog open={isFormOpen} onOpenChange={setIsFormOpen} domain={editedDomain} />
            <DeleteConfirmationDialog
                isOpen={Boolean(domainToDelete)}
                onOpenChange={open => !open && setDomainToDelete(null)}
                onDelete={async () => {
                    if (domainToDelete) {
                        await deleteMutation.mutateAsync(domainToDelete._id)
                    }
                }}
                onDeleteSuccess={() => setDomainToDelete(null)}
                title={t("domains.delete_title")}
                description={domainToDelete ? t("domains.delete_description", { name: domainToDelete.name }) : ""}
            />
        </>
    )
}

export default Domains
