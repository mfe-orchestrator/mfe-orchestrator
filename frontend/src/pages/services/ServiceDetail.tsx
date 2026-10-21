import { Alert, AlertDescription, Card, CardContent, CardDescription, CardHeader, CardTitle, DescriptionItem, DescriptionList, Spinner } from "@mfe-orchestrator/design-system"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Copy, ExternalLink, Hammer } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Navigate, useParams } from "react-router-dom"
import AiWorkspace from "@/components/ai-workspace/AiWorkspace"
import { workspaceRepositoriesOf } from "@/components/ai-workspace/RepositoryBranches"
import useProjectAiModels from "@/components/assistant/useProjectAiModels"
import { Badge, Button } from "@/components/atoms"
import { ApiStatusHandler } from "@/components/organisms"
import RepositoryLink from "@/components/RepositoryLink"
import type { EnvironmentDTO } from "@/hooks/apiClients/useEnvironmentsApi"
import useServicesApi, { Service } from "@/hooks/apiClients/useServicesApi"
import { useVariableMapsQuery } from "@/pages/variable-maps/partials/variableMaps"
import useToastNotificationStore from "@/store/useToastNotificationStore"
import ServiceBuildDialog from "./partials/ServiceBuildDialog"
import ServiceHeader, { isServiceAiAvailable } from "./partials/ServiceHeader"
import ServiceVariableMapsSection from "./partials/ServiceVariableMapsSection"
import ServiceVersionsTable from "./partials/ServiceVersionsTable"
import { useProjectEnvironmentsQuery } from "./partials/serviceVariables"

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

const ServiceLink: React.FC<{ href: string; label: string }> = ({ href, label }) => (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline-offset-4 hover:underline" title={href}>
        {label}
        <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
    </a>
)

/** Where the service answers in each environment, with the docs and the OpenAPI spec reached from there */
const ServiceUrls: React.FC<{ service: Service; environments: EnvironmentDTO[] }> = ({ service, environments }) => {
    const { t } = useTranslation()
    // A URL left behind by a deleted environment has no row to show
    const exposed = environments.some(environment => service.urls?.some(url => url.environmentId === environment._id))

    return (
        <div>
            <h3 className="mb-2 text-base font-semibold">{t("services.urls.title")}</h3>
            {exposed ? (
                <ul className="flex flex-col gap-2">
                    {environments.map(environment => {
                        const url = service.urls?.find(candidate => candidate.environmentId === environment._id)?.url
                        return (
                            <li key={environment._id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                                <Badge variant="outline">{environment.name}</Badge>
                                {url ? (
                                    <>
                                        <span className="min-w-0 break-all font-mono">
                                            <ServiceLink href={url} label={url} />
                                        </span>
                                        {service.docsPath && <ServiceLink href={url + service.docsPath} label={t("services.urls.open_docs")} />}
                                        {service.openApiPath && <ServiceLink href={url + service.openApiPath} label={t("services.urls.open_openapi")} />}
                                    </>
                                ) : (
                                    <span className="text-foreground-secondary">{t("services.urls.not_exposed")}</span>
                                )}
                            </li>
                        )
                    })}
                </ul>
            ) : (
                <p className="text-sm text-foreground-secondary">{t("services.urls.empty")}</p>
            )}
        </div>
    )
}

const ServiceConfigurationSection: React.FC<{ service: Service; environments: EnvironmentDTO[] }> = ({ service, environments }) => {
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
                    <DescriptionItem label={t("services.exposure_path")}>
                        <ServicePath path={service.exposurePath} />
                    </DescriptionItem>
                    <DescriptionItem label={t("services.image_repository")}>{service.image?.repository ? <span className="font-mono">{service.image.repository}</span> : "—"}</DescriptionItem>
                </DescriptionList>
                <ServiceUrls service={service} environments={environments} />
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
                {service.codeRepository?.enabled ? <RepositoryLink repository={service.codeRepository} /> : <p className="text-foreground-secondary">{t("services.no_repository")}</p>}
            </CardContent>
        </Card>
    )
}

/**
 * The landing screen of a service: Edit with AI on its repository, the same workspace as a microfrontend's.
 * Without AI editing, the overview takes its place. Not inside an ApiStatusHandler: it unmounts its children on every background refetch, and the workspace holds a draft prompt.
 */
const ServiceAiSection: React.FC<{ serviceQuery: { isPending: boolean; isError: boolean; error: unknown; data?: Service } }> = ({ serviceQuery }) => {
    const { t } = useTranslation()
    const aiModels = useProjectAiModels()

    // The project's AIs decide where the page goes: it waits for them as for the service.
    if (serviceQuery.isPending || aiModels.isPending) {
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
    if (!isServiceAiAvailable(service, aiModels.enabled)) return <Navigate to={`/service/${service._id}/overview`} replace />

    return (
        <div className="flex min-h-full flex-col gap-6">
            <ServiceHeader service={service} active="ai" />
            {/* Keyed: the route instance is reused across services, and a draft must not follow the user to another one. */}
            <AiWorkspace key={service._id} target={{ kind: "service", id: service._id! }} name={service.name} repositories={workspaceRepositoriesOf("service", service)} />
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
    const environmentsQuery = useProjectEnvironmentsQuery()
    const configMapsQuery = useVariableMapsQuery("configMap")
    const secretsQuery = useVariableMapsQuery("secret")

    const service = serviceQuery.data
    const hasRepository = Boolean(service?.codeRepository?.enabled)

    if (view === "ai") return <ServiceAiSection serviceQuery={serviceQuery} />

    return (
        <ApiStatusHandler queries={[serviceQuery, versionsQuery, environmentsQuery, configMapsQuery, secretsQuery]} interceptEmpty={false}>
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
                    <ServiceConfigurationSection service={service} environments={environmentsQuery.data ?? []} />
                    <ServiceVariableMapsSection service={service} configMaps={configMapsQuery.data ?? []} secrets={secretsQuery.data ?? []} environments={environmentsQuery.data ?? []} />
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
