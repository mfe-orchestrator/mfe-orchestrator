import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@mfe-orchestrator/design-system"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, CirclePlus, LayoutDashboard, Pencil, Server } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, useNavigate, useParams } from "react-router-dom"
import { Badge, Button } from "@/components/atoms"
import { ApiStatusHandler } from "@/components/organisms"
import SinglePageLayout from "@/components/SinglePageLayout"
import useDomainsApi from "@/hooks/apiClients/useDomainsApi"
import useMicrofrontendsApi from "@/hooks/apiClients/useMicrofrontendsApi"
import useServicesApi from "@/hooks/apiClients/useServicesApi"
import useProjectStore from "@/store/useProjectStore"
import DomainFormDialog from "./partials/DomainFormDialog"

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

    return (
        <ApiStatusHandler queries={[domainQuery, microfrontendsQuery, servicesQuery]} interceptEmpty={false}>
            {domain && (
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
                        <Button variant="secondary" onClick={() => setIsFormOpen(true)}>
                            <Pencil />
                            {t("common.edit")}
                        </Button>
                    }
                >
                    <div className="grid gap-6 lg:grid-cols-2">
                        <MemberSection
                            title={t("domains.detail.frontend_title")}
                            description={t("domains.detail.frontend_description")}
                            icon={<LayoutDashboard className="size-5" aria-hidden="true" />}
                            emptyLabel={t("domains.detail.frontend_empty")}
                            addLabel={t("domains.detail.add_microfrontend")}
                            onAdd={() => navigate(`/microfrontend/new?${domainParam}`)}
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
                            onAdd={() => navigate(`/service/new?${domainParam}`)}
                            members={services.map(service => ({
                                id: service._id!,
                                name: service.name,
                                slug: service.slug,
                                version: service.version,
                                href: `/service/${service._id}`
                            }))}
                        />
                    </div>
                    <DomainFormDialog open={isFormOpen} onOpenChange={setIsFormOpen} domain={domain} />
                </SinglePageLayout>
            )}
        </ApiStatusHandler>
    )
}

export default DomainDetail
