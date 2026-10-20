import { Card, CardContent, CardFooter, CardHeader, CardTitle, EmptyState, Tabs, TabsContent, TabsList, TabsTrigger } from "@mfe-orchestrator/design-system"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CirclePlus, FolderOpen, LayoutDashboard, LayoutGrid, Orbit, Pencil, Rocket, Server, Sparkles, Trash2 } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/atoms"
import { ApiStatusHandler } from "@/components/organisms"
import SinglePageLayout from "@/components/SinglePageLayout"
import { DeleteConfirmationDialog } from "@/components/ui/DeleteConfirmationDialog"
import useDomainLinksApi, { DomainLink } from "@/hooks/apiClients/useDomainLinksApi"
import useDomainsApi, { Domain } from "@/hooks/apiClients/useDomainsApi"
import useMicrofrontendsApi from "@/hooks/apiClients/useMicrofrontendsApi"
import useServicesApi from "@/hooks/apiClients/useServicesApi"
import useProjectStore from "@/store/useProjectStore"
import DomainFormDialog from "./partials/DomainFormDialog"
import DomainGalaxy from "./partials/DomainGalaxy"
import DomainLinkDialog from "./partials/DomainLinkDialog"

const VIEWS = [
    { value: "cards", icon: LayoutGrid, labelKey: "domains.viewCards" },
    { value: "galaxy", icon: Orbit, labelKey: "domains.viewGalaxy" }
] as const

type View = (typeof VIEWS)[number]["value"]

const Domains = () => {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const projectId = useProjectStore(state => state.project?._id)
    const domainsApi = useDomainsApi()
    const microfrontendsApi = useMicrofrontendsApi()
    const servicesApi = useServicesApi()
    const domainLinksApi = useDomainLinksApi()

    const [view, setView] = useState<View>("galaxy")
    const [isFormOpen, setIsFormOpen] = useState(false)
    const [editedDomain, setEditedDomain] = useState<Domain | undefined>()
    const [domainToDelete, setDomainToDelete] = useState<Domain | null>(null)
    const [linkToCreate, setLinkToCreate] = useState<{ sourceDomainId: string; targetDomainId: string } | null>(null)
    const [linkToDelete, setLinkToDelete] = useState<DomainLink | null>(null)

    const domainsQuery = useQuery({
        queryKey: ["domains", projectId],
        queryFn: domainsApi.getAll,
        enabled: !!projectId
    })
    // The members are only needed by the galaxy, so the cards do not wait for them.
    const microfrontendsQuery = useQuery({
        queryKey: ["microfrontends-by-project-id", projectId],
        queryFn: () => microfrontendsApi.getByProjectId(projectId!),
        enabled: !!projectId && view === "galaxy"
    })
    const servicesQuery = useQuery({ queryKey: ["services", projectId], queryFn: servicesApi.getAll, enabled: !!projectId && view === "galaxy" })
    const domainLinksQuery = useQuery({ queryKey: ["domain-links", projectId], queryFn: domainLinksApi.getAll, enabled: !!projectId && view === "galaxy" })

    const deleteMutation = useMutation({
        mutationFn: domainsApi.deleteSingle,
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["domains"] })
            await queryClient.invalidateQueries({ queryKey: ["services"] })
            await queryClient.invalidateQueries({ queryKey: ["microfrontends-by-project-id"] })
            // The relations of the domain go with it
            await queryClient.invalidateQueries({ queryKey: ["domain-links"] })
        }
    })

    const deleteLinkMutation = useMutation({
        mutationFn: domainLinksApi.deleteSingle,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["domain-links"] })
    })

    const openForm = (domain?: Domain) => {
        setEditedDomain(domain)
        setIsFormOpen(true)
    }

    const domains = domainsQuery.data ?? []
    const domainNamed = (id: string) => ({ id, name: domains.find(domain => domain._id === id)?.name ?? "" })

    return (
        <>
            {/* The Tabs root wraps the layout so the view switcher can live in the page header, as on the domain page. */}
            <Tabs value={view} onValueChange={value => setView(value as View)} className="flex min-h-full flex-col" layoutSize="sm" iconButtons tabsListPosition="end">
                <SinglePageLayout
                    title={t("domains.title")}
                    description={t("domains.description")}
                    right={
                        domains.length > 0 && (
                            <div className="flex flex-[0_0_auto] items-center gap-2">
                                <TabsList>
                                    {VIEWS.map(({ value, icon: Icon, labelKey }) => (
                                        <TabsTrigger
                                            key={value}
                                            value={value}
                                            aria-label={t(labelKey)}
                                            title={t(labelKey)}
                                            className="data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground hover:data-[state=active]:bg-primary/85 focus-visible:data-[state=active]:bg-primary/85"
                                        >
                                            <Icon />
                                        </TabsTrigger>
                                    ))}
                                </TabsList>
                                <Button variant="secondary" onClick={() => navigate("/domains/deployments")} dataTestId="domain-deployments-matrix">
                                    <Rocket />
                                    {t("domains.deployments.open")}
                                </Button>
                                <Button variant="primary" onClick={() => openForm()} dataTestId="domain-create">
                                    <CirclePlus />
                                    {t("domains.add_new")}
                                </Button>
                            </div>
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
                            <>
                                <TabsContent value="galaxy" className="mt-0">
                                    <ApiStatusHandler queries={[microfrontendsQuery, servicesQuery, domainLinksQuery]} interceptEmpty={false}>
                                        <DomainGalaxy
                                            domains={domains}
                                            microfrontends={microfrontendsQuery.data ?? []}
                                            services={servicesQuery.data ?? []}
                                            links={domainLinksQuery.data ?? []}
                                            onLink={(sourceDomainId, targetDomainId) => setLinkToCreate({ sourceDomainId, targetDomainId })}
                                            onUnlink={setLinkToDelete}
                                        />
                                    </ApiStatusHandler>
                                </TabsContent>
                                <TabsContent value="cards" className="mt-0">
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
                                                    {/* A domain opens on Edit with AI, which says why it cannot run when no AI provider is configured. */}
                                                    <Button variant="primary" size="sm" className="flex-1" onClick={() => navigate(`/domain/${domain._id}`)}>
                                                        <Sparkles />
                                                        {t("domains.ai.open")}
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
                                </TabsContent>
                            </>
                        )}
                    </ApiStatusHandler>
                </SinglePageLayout>
            </Tabs>
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
            <DomainLinkDialog link={linkToCreate && { source: domainNamed(linkToCreate.sourceDomainId), target: domainNamed(linkToCreate.targetDomainId) }} onClose={() => setLinkToCreate(null)} />
            <DeleteConfirmationDialog
                isOpen={Boolean(linkToDelete)}
                onOpenChange={open => !open && setLinkToDelete(null)}
                onDelete={async () => {
                    if (linkToDelete) {
                        await deleteLinkMutation.mutateAsync(linkToDelete._id)
                    }
                }}
                onDeleteSuccess={() => setLinkToDelete(null)}
                title={t("domains.galaxy.link_delete")}
                description={
                    linkToDelete ? t("domains.galaxy.link_delete_description", { source: domainNamed(linkToDelete.sourceDomainId).name, target: domainNamed(linkToDelete.targetDomainId).name }) : ""
                }
            />
        </>
    )
}

export default Domains
