import { Alert, AlertDescription, Card, CardContent, CardDescription, CardHeader, CardTitle, DescriptionItem, DescriptionList, Spinner } from "@mfe-orchestrator/design-system"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Copy, Hammer } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Navigate, useParams } from "react-router-dom"
import useAssistantEnabled from "@/components/assistant/useAssistantEnabled"
import { Badge, Button } from "@/components/atoms"
import { ApiStatusHandler } from "@/components/organisms"
import useServicesApi, { Service } from "@/hooks/apiClients/useServicesApi"
import { AiChangeWorkspace } from "@/pages/microfrontends/partials/components"
import useToastNotificationStore from "@/store/useToastNotificationStore"
import RepositoryLink from "./partials/RepositoryLink"
import ServiceBuildDialog from "./partials/ServiceBuildDialog"
import ServiceHeader, { isServiceAiAvailable } from "./partials/ServiceHeader"
import ServiceVersionsTable from "./partials/ServiceVersionsTable"

/** A path of the service, as declared: no URL is made up from it, the host depends on where the service runs */
const ServicePath: React.FC<{ path?: string | null }> = ({ path }) => {
    const { t } = useTranslation()
    const notifications = useToastNotificationStore()

    if (!path) return "—"

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(path)
            notifications.showSuccessNotification({ message: t("services.configuration.path_copied") })
        } catch {
            notifications.showErrorNotification({ message: t("services.configuration.copy_failed") })
        }
    }

    return (
        <span className="inline-flex items-center gap-1">
            <span className="font-mono">{path}</span>
            <Button variant="ghost" size="icon-sm" onClick={copy} aria-label={t("services.configuration.copy_path")} title={t("services.configuration.copy_path")}>
                <Copy />
            </Button>
        </span>
    )
}

const ServiceConfigurationSection: React.FC<{ service: Service }> = ({ service }) => {
    const { t } = useTranslation()

    return (
        <Card>
            <CardHeader>
                <CardTitle className="mb-0">{t("services.configuration.title")}</CardTitle>
                <CardDescription>{t("services.configuration.description")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 pt-3">
                <DescriptionList orientation="inline">
                    <DescriptionItem label={t("services.port")}>{service.port}</DescriptionItem>
                    <DescriptionItem label={t("services.liveness_path")}>
                        <ServicePath path={service.livenessPath} />
                    </DescriptionItem>
                    <DescriptionItem label={t("services.readiness_path")}>
                        <ServicePath path={service.readinessPath} />
                    </DescriptionItem>
                    <DescriptionItem label={t("services.docs_path")}>
                        <ServicePath path={service.docsPath} />
                    </DescriptionItem>
                    <DescriptionItem label={t("services.openapi_path")}>
                        <ServicePath path={service.openApiPath} />
                    </DescriptionItem>
                    <DescriptionItem label={t("services.image_repository")}>{service.image?.repository ? <span className="font-mono">{service.image.repository}</span> : "—"}</DescriptionItem>
                </DescriptionList>
                <div>
                    <h3 className="mb-2 text-base font-semibold">{t("services.env.title")}</h3>
                    {service.env?.length ? (
                        <ul className="flex flex-col gap-2">
                            {service.env.map(variable => (
                                <li key={variable.name} className="flex flex-wrap items-center gap-2 text-sm">
                                    <span className="font-mono font-medium">{variable.name}</span>
                                    {variable.required && <Badge variant="outline">{t("services.env.required")}</Badge>}
                                    {variable.secret && <Badge variant="outline">{t("services.env.secret")}</Badge>}
                                    {variable.description && <span className="text-foreground-secondary">{variable.description}</span>}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-foreground-secondary">{t("services.env.empty")}</p>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}

const ServiceRepositorySection: React.FC<{ service: Service }> = ({ service }) => {
    const { t } = useTranslation()

    return (
        <Card>
            <CardHeader>
                <CardTitle className="mb-0">{t("services.code_repository")}</CardTitle>
            </CardHeader>
            <CardContent className="pt-3 text-sm">
                {service.codeRepository?.enabled ? <RepositoryLink service={service} /> : <p className="text-foreground-secondary">{t("services.no_repository")}</p>}
            </CardContent>
        </Card>
    )
}

/**
 * Edit with AI on the repository of a service: the same workspace as a microfrontend's. Not inside an
 * ApiStatusHandler: it unmounts its children on every background refetch, and the workspace holds a draft prompt.
 */
const ServiceAiSection: React.FC<{ serviceQuery: { isPending: boolean; isError: boolean; error: unknown; data?: Service } }> = ({ serviceQuery }) => {
    const { t } = useTranslation()
    const assistantEnabled = useAssistantEnabled()

    if (serviceQuery.isPending) {
        return (
            <div className="flex min-h-[200px] items-center justify-center">
                <Spinner size={32} />
            </div>
        )
    }

    if (serviceQuery.isError || !serviceQuery.data) {
        return (
            <Alert variant="destructive">
                <AlertDescription>{serviceQuery.error instanceof Error ? serviceQuery.error.message : t("app.error.generic")}</AlertDescription>
            </Alert>
        )
    }

    const service = serviceQuery.data
    if (!isServiceAiAvailable(service, assistantEnabled)) return <Navigate to={`/service/${service._id}`} replace />

    return (
        <div className="flex min-h-full flex-col gap-6">
            <ServiceHeader service={service} active="ai" />
            {/* Keyed: the route instance is reused across services, and a draft must not follow the user to another one. */}
            <AiChangeWorkspace key={service._id} target={{ kind: "service", id: service._id! }} name={service.name} />
        </div>
    )
}

interface ServiceDetailProps {
    /** The overview of the service, or its Edit with AI workspace. */
    view?: "overview" | "ai"
}

const ServiceDetail: React.FC<ServiceDetailProps> = ({ view = "overview" }) => {
    const { t } = useTranslation()
    const { id } = useParams<{ id: string }>()
    const servicesApi = useServicesApi()
    const queryClient = useQueryClient()
    const [buildOpen, setBuildOpen] = useState(false)

    const serviceQuery = useQuery({ queryKey: ["service", id], queryFn: () => servicesApi.getSingle(id!), enabled: !!id })
    const versionsQuery = useQuery({ queryKey: ["service-versions", id], queryFn: () => servicesApi.getVersions(id!), enabled: !!id && view === "overview" })

    const service = serviceQuery.data
    const hasRepository = Boolean(service?.codeRepository?.enabled)

    if (view === "ai") return <ServiceAiSection serviceQuery={serviceQuery} />

    return (
        <ApiStatusHandler queries={[serviceQuery, versionsQuery]} interceptEmpty={false}>
            {service && (
                <div className="flex min-h-full flex-col gap-6">
                    <ServiceHeader
                        service={service}
                        active="overview"
                        actions={
                            hasRepository && (
                                <Button variant="primary" onClick={() => setBuildOpen(true)}>
                                    <Hammer />
                                    {t("services.build.action")}
                                </Button>
                            )
                        }
                    />
                    {/* Sections are siblings so further ones (e.g. AI) can be added next to them. */}
                    <ServiceRepositorySection service={service} />
                    <ServiceVersionsTable versions={versionsQuery.data ?? []} />
                    <ServiceConfigurationSection service={service} />
                    {hasRepository && (
                        <ServiceBuildDialog
                            open={buildOpen}
                            onOpenChange={setBuildOpen}
                            service={service}
                            onBuilt={() => {
                                queryClient.invalidateQueries({ queryKey: ["service-versions", id] })
                                queryClient.invalidateQueries({ queryKey: ["service", id] })
                            }}
                        />
                    )}
                </div>
            )}
        </ApiStatusHandler>
    )
}

export default ServiceDetail
