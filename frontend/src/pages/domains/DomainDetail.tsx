import { Card, CardContent, CardDescription, CardHeader, CardTitle, Tabs, TabsContent, TabsList, TabsTrigger } from "@mfe-orchestrator/design-system"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, CirclePlus, Columns2, LayoutDashboard, LayoutGrid, Pencil, Server, StretchHorizontal, Workflow } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, useNavigate, useParams } from "react-router-dom"
import { Badge, Button } from "@/components/atoms"
import { ApiStatusHandler } from "@/components/organisms"
import SinglePageLayout from "@/components/SinglePageLayout"
import useDomainsApi from "@/hooks/apiClients/useDomainsApi"
import useMicrofrontendsApi from "@/hooks/apiClients/useMicrofrontendsApi"
import useServicesApi from "@/hooks/apiClients/useServicesApi"
import { MicrofrontendFlow, MicrofrontendsGrid, MicrofrontendsTable } from "@/pages/microfrontends/partials/views"
import { ServicesGrid } from "@/pages/services/partials/ServicesGrid"
import { ServicesTable } from "@/pages/services/partials/ServicesTable"
import useProjectStore from "@/store/useProjectStore"
import DomainFormDialog from "./partials/DomainFormDialog"

const VIEWS = [
    { value: "overview", icon: Columns2, labelKey: "domains.detail.viewOverview" },
    { value: "flow", icon: Workflow, labelKey: "domains.detail.viewFlow" },
    { value: "grid", icon: LayoutGrid, labelKey: "domains.detail.viewGrid" },
    { value: "table", icon: StretchHorizontal, labelKey: "domains.detail.viewTable" }
] as const

type View = (typeof VIEWS)[number]["value"]

interface ViewSectionProps {
    title: string
    icon: React.ReactNode
    isEmpty: boolean
    emptyLabel: string
    addLabel: string
    onAdd: () => void
    children: React.ReactNode
}

/** One half of the domain in the grid, table and flow views: the heading and add action the overview cards carry. */
const ViewSection: React.FC<ViewSectionProps> = ({ title, icon, isEmpty, emptyLabel, addLabel, onAdd, children }) => (
    <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
                {icon}
                {title}
            </h2>
            <Button variant="secondary" size="sm" className="shrink-0" onClick={onAdd}>
                <CirclePlus />
                {addLabel}
            </Button>
        </div>
        {isEmpty ? <p className="text-sm text-foreground-secondary">{emptyLabel}</p> : children}
    </section>
)

interface MemberSectionProps {
    title: string
    description: string
    icon: React.ReactNode
    emptyLabel: string
    addLabel: string
    onAdd: () => void
    members: { id: string; name: string; slug: string; version?: string; href: string }[]
}

const MemberSection: React.FC<MemberSectionProps> = ({ title, description, icon, emptyLabel, addLabel, onAdd, members }) => (
    <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
            <div className="min-w-0">
                <CardTitle className="mb-0 flex items-center gap-2">
                    {icon}
                    {title}
                </CardTitle>
                <CardDescription>{description}</CardDescription>
            </div>
            <Button variant="secondary" size="sm" className="shrink-0" onClick={onAdd}>
                <CirclePlus />
                {addLabel}
            </Button>
        </CardHeader>
        <CardContent className="pt-3">
            {members.length === 0 ? (
                <p className="text-sm text-foreground-secondary">{emptyLabel}</p>
            ) : (
                <ul className="divide-y divide-divider">
                    {members.map(member => (
                        <li key={member.id} className="flex items-center justify-between gap-3 py-2">
                            <Link to={member.href} className="min-w-0 hover:underline">
                                <span className="block truncate font-medium">{member.name}</span>
                                <span className="block truncate text-sm text-foreground-secondary">{member.slug}</span>
                            </Link>
                            {member.version && <Badge className="shrink-0">{member.version}</Badge>}
                        </li>
                    ))}
                </ul>
            )}
        </CardContent>
    </Card>
)

const DomainDetail = () => {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const { id } = useParams<{ id: string }>()
    const projectId = useProjectStore(state => state.project?._id)
    const domainsApi = useDomainsApi()
    const microfrontendsApi = useMicrofrontendsApi()
    const servicesApi = useServicesApi()
    const [isFormOpen, setIsFormOpen] = useState(false)
    const [view, setView] = useState<View>("overview")

    const domainQuery = useQuery({ queryKey: ["domain", id], queryFn: () => domainsApi.getSingle(id!), enabled: !!id })
    const microfrontendsQuery = useQuery({
        queryKey: ["microfrontends-by-project-id", projectId],
        queryFn: () => microfrontendsApi.getByProjectId(projectId!),
        enabled: !!projectId
    })
    const servicesQuery = useQuery({ queryKey: ["services", projectId], queryFn: servicesApi.getAll, enabled: !!projectId })

    const domain = domainQuery.data
    const microfrontends = (microfrontendsQuery.data ?? []).filter(microfrontend => microfrontend.domainId === id)
    const services = (servicesQuery.data ?? []).filter(service => service.domainId === id)
    const domainParam = `domainId=${encodeURIComponent(id ?? "")}`
    const onAddMicrofrontend = (parentId?: string) => navigate(`/microfrontend/new?${domainParam}${parentId ? `&parentId=${encodeURIComponent(parentId)}` : ""}`)
    const onAddService = () => navigate(`/service/new?${domainParam}`)

    const frontendSection = {
        title: t("domains.detail.frontend_title"),
        icon: <LayoutDashboard className="size-5" aria-hidden="true" />,
        isEmpty: microfrontends.length === 0,
        emptyLabel: t("domains.detail.frontend_empty"),
        addLabel: t("domains.detail.add_microfrontend"),
        onAdd: () => onAddMicrofrontend()
    }
    const backendSection = {
        title: t("domains.detail.backend_title"),
        icon: <Server className="size-5" aria-hidden="true" />,
        isEmpty: services.length === 0,
        emptyLabel: t("domains.detail.backend_empty"),
        addLabel: t("domains.detail.add_service"),
        onAdd: onAddService
    }

    return (
        <ApiStatusHandler queries={[domainQuery, microfrontendsQuery, servicesQuery]} interceptEmpty={false}>
            {domain && (
                // The Tabs root wraps the layout so the view switcher can live in the page header, as on the microfrontends page.
                <Tabs value={view} onValueChange={value => setView(value as View)} className="flex min-h-full flex-col" layoutSize="sm" iconButtons tabsListPosition="end">
                    <SinglePageLayout
                        title={domain.name}
                        description={domain.description || t("domains.detail.description")}
                        lrContainerClassname="items-end"
                        left={
                            <Button variant="ghost" size="sm" onClick={() => navigate("/domains")}>
                                <ArrowLeft />
                                {t("domains.detail.back")}
                            </Button>
                        }
                        right={
                            <div className="flex flex-[0_0_auto] items-center gap-2">
                                <TabsList>
                                    {VIEWS.map(({ value, icon: Icon, labelKey }) => (
                                        // Same switcher as the microfrontends page: labelled via aria-label/title, primary fill when active.
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
                                <Button variant="secondary" onClick={() => setIsFormOpen(true)}>
                                    <Pencil />
                                    {t("common.edit")}
                                </Button>
                            </div>
                        }
                    >
                        <TabsContent value="overview" className="mt-0">
                            <div className="grid gap-6 lg:grid-cols-2">
                                <MemberSection
                                    title={t("domains.detail.frontend_title")}
                                    description={t("domains.detail.frontend_description")}
                                    icon={<LayoutDashboard className="size-5" aria-hidden="true" />}
                                    emptyLabel={t("domains.detail.frontend_empty")}
                                    addLabel={t("domains.detail.add_microfrontend")}
                                    onAdd={() => onAddMicrofrontend()}
                                    members={microfrontends.map(microfrontend => ({
                                        id: microfrontend._id!,
                                        name: microfrontend.name,
                                        slug: microfrontend.slug,
                                        version: microfrontend.version,
                                        href: `/microfrontend/${microfrontend._id}/settings`
                                    }))}
                                />
                                <MemberSection
                                    title={t("domains.detail.backend_title")}
                                    description={t("domains.detail.backend_description")}
                                    icon={<Server className="size-5" aria-hidden="true" />}
                                    emptyLabel={t("domains.detail.backend_empty")}
                                    addLabel={t("domains.detail.add_service")}
                                    onAdd={onAddService}
                                    members={services.map(service => ({
                                        id: service._id!,
                                        name: service.name,
                                        slug: service.slug,
                                        version: service.version,
                                        href: `/service/${service._id}`
                                    }))}
                                />
                            </div>
                        </TabsContent>
                        <TabsContent value="flow" className="mt-0 flex flex-col gap-8">
                            {/* Positions are saved on the microfrontend, so the blocks sit where they were left on the microfrontends page too. */}
                            <ViewSection {...frontendSection}>
                                <MicrofrontendFlow microfrontends={microfrontends} onAddNewMicrofrontend={onAddMicrofrontend} />
                            </ViewSection>
                            <ViewSection {...backendSection}>
                                <ServicesGrid services={services} />
                            </ViewSection>
                        </TabsContent>
                        <TabsContent value="grid" className="mt-0 flex flex-col gap-8">
                            <ViewSection {...frontendSection}>
                                <MicrofrontendsGrid microfrontends={microfrontends} onAddNewMicrofrontend={onAddMicrofrontend} />
                            </ViewSection>
                            <ViewSection {...backendSection}>
                                <ServicesGrid services={services} />
                            </ViewSection>
                        </TabsContent>
                        <TabsContent value="table" className="mt-0 flex flex-col gap-8">
                            <ViewSection {...frontendSection}>
                                <MicrofrontendsTable microfrontends={microfrontends} />
                            </ViewSection>
                            <ViewSection {...backendSection}>
                                <ServicesTable services={services} />
                            </ViewSection>
                        </TabsContent>
                        <DomainFormDialog open={isFormOpen} onOpenChange={setIsFormOpen} domain={domain} />
                    </SinglePageLayout>
                </Tabs>
            )}
        </ApiStatusHandler>
    )
}

export default DomainDetail
