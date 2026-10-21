import { Tabs, TabsContent, TabsList, TabsTrigger } from "@mfe-orchestrator/design-system"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Bot, FolderCog, GitBranch, HardDrive, Key, Rocket, Server, Settings2, Users } from "lucide-react"
import React from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useSearchParams } from "react-router-dom"
// Components
import { ApiStatusHandler } from "@/components/organisms"
import SinglePageLayout from "@/components/SinglePageLayout"
// Hooks & Stores
import useProjectApi from "@/hooks/apiClients/useProjectApi"
import { errorCodeOf } from "@/hooks/useApiClient"
import useProjectStore from "@/store/useProjectStore"
import useToastNotificationStore from "@/store/useToastNotificationStore"
import { DangerZone, PipelineTemplatesSection, ProjectContextSection, ProjectInfoSection, ProjectStatsSection } from "./partials"
import type { PipelineTemplatesFormValues } from "./partials/PipelineTemplatesSection"
import type { ProjectContextFormValues } from "./partials/ProjectContextSection"
import type { ProjectInfoFormValues } from "./partials/ProjectInfoSection"

const TABS = ["general", "access", "resources", "delivery"] as const
type Tab = (typeof TABS)[number]

const TAB_ICONS: Record<Tab, React.ComponentType> = { general: Settings2, access: Users, resources: FolderCog, delivery: Rocket }

/** I rifiuti del salvataggio dei template di pipeline, per codice */
const PIPELINES_ERROR_KEYS: Record<string, string> = {
    PIPELINES_OWNER_REQUIRED: "settings.pipelines.errors.owner_required",
    PIPELINES_REPOSITORY_REQUIRED: "settings.pipelines.errors.repository_required",
    PIPELINES_REPOSITORY_INVALID: "settings.pipelines.errors.repository_invalid",
    PIPELINES_REF_INVALID: "settings.pipelines.errors.ref_invalid"
}

/**
 * Le impostazioni del progetto, un tema per scheda: i dati e il contesto AI, chi vi accede, le sue risorse, le pipeline
 * dei repository creati da un template. La scheda sta nell'URL (`?tab=delivery`) cosi' un link puo' puntare dritto a una di esse.
 */
export const Settings: React.FC = () => {
    const notifications = useToastNotificationStore()
    const { t } = useTranslation()
    const { project, setProject } = useProjectStore()
    const projectApi = useProjectApi()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const [searchParams, setSearchParams] = useSearchParams()

    const requestedTab = searchParams.get("tab")
    const tab: Tab = TABS.includes(requestedTab as Tab) ? (requestedTab as Tab) : "general"

    const projectQuery = useQuery({
        queryKey: ["project-summary", project._id],
        queryFn: () => projectApi.getProjectSummaryById(project._id),
        enabled: !!project._id
    })

    const handleDeleteProjectSuccess = async () => {
        notifications.showSuccessNotification({ message: t("settings.notifications.projectDeleted") })
        // Chiave del listato dei progetti: senza prefisso corretto lo switcher continuerebbe a
        // mostrare il progetto appena eliminato.
        queryClient.invalidateQueries({ queryKey: ["projects-mine"] })
        setProject(null)
        navigate("/")
    }

    const updateProjectMutation = useMutation({
        mutationFn: (values: ProjectInfoFormValues) =>
            projectApi.updateProject(project._id, {
                name: values.name.trim(),
                // Un campo svuotato vuol dire "nessuna descrizione", che l'API esprime con un null esplicito.
                description: values.description?.trim() ? values.description : null
            }),
        onSuccess: updated => {
            // Header e switcher leggono lo store, quindi il nuovo nome deve arrivare anche lì.
            setProject({ ...project, name: updated.name, description: updated.description })
            queryClient.invalidateQueries({ queryKey: ["project-summary", project._id] })
            queryClient.invalidateQueries({ queryKey: ["projects-mine"] })
            notifications.showSuccessNotification({ message: t("settings.notifications.projectUpdated") })
        },
        onError: () => {
            notifications.showErrorNotification({ message: t("settings.notifications.projectUpdateFailed") })
        }
    })

    const updateContextMutation = useMutation({
        mutationFn: (values: ProjectContextFormValues) => projectApi.updateProject(project._id, { context: values.context.trim() ? values.context : null }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["project-summary", project._id] })
            notifications.showSuccessNotification({ message: t("settings.notifications.contextUpdated") })
        },
        onError: () => {
            notifications.showErrorNotification({ message: t("settings.notifications.contextUpdateFailed") })
        }
    })

    const pipelinesErrorMessage = (error: Error) => {
        const key = PIPELINES_ERROR_KEYS[errorCodeOf(error) ?? ""]
        return key ? t(key) : undefined
    }

    const updatePipelinesMutation = useMutation({
        mutationFn: (values: PipelineTemplatesFormValues) => projectApi.updateProject(project._id, { pipelines: values }, pipelinesErrorMessage),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["project-summary", project._id] })
            notifications.showSuccessNotification({ message: t("settings.pipelines.saved") })
        }
    })

    const projectData = projectQuery.data?.project

    return (
        <ApiStatusHandler queries={[projectQuery]}>
            <SinglePageLayout title={t("settings.title")} description={t("settings.subtitle")}>
                <Tabs value={tab} onValueChange={value => setSearchParams({ tab: value }, { replace: true })}>
                    <TabsList aria-label={t("settings.tabs.label")}>
                        {TABS.map(value => {
                            const Icon = TAB_ICONS[value]
                            return (
                                <TabsTrigger key={value} value={value} dataTestId={`settings-tab-${value}`}>
                                    <Icon />
                                    {t(`settings.tabs.${value}`)}
                                </TabsTrigger>
                            )
                        })}
                    </TabsList>

                    <TabsContent value="general" className="mt-6 flex flex-col gap-6">
                        {projectData && <ProjectInfoSection {...projectData} onUpdate={values => updateProjectMutation.mutate(values)} isUpdating={updateProjectMutation.isPending} />}

                        {projectData && <ProjectContextSection context={projectData.context} onUpdate={values => updateContextMutation.mutate(values)} isUpdating={updateContextMutation.isPending} />}

                        <DangerZone projectName={projectData?.name} projectId={projectData?._id} onDeleteSuccess={handleDeleteProjectSuccess} />
                    </TabsContent>

                    <TabsContent value="access" className="mt-6">
                        <ProjectStatsSection
                            title={t("settings.stats.accessTitle")}
                            stats={[
                                {
                                    icon: <Users />,
                                    title: t("settings.stats.teamMembers"),
                                    value: projectQuery.data?.count?.users,
                                    href: "/project-users"
                                },
                                {
                                    icon: <Key />,
                                    title: t("settings.stats.apiKeys"),
                                    value: projectQuery.data?.count?.apiKeys,
                                    href: "/api-keys"
                                },
                                {
                                    icon: <Bot />,
                                    title: t("settings.stats.mcpClients"),
                                    value: "—",
                                    buttonText: t("settings.stats.manage"),
                                    href: "/mcp-clients"
                                }
                            ]}
                        />
                    </TabsContent>

                    <TabsContent value="resources" className="mt-6">
                        <ProjectStatsSection
                            title={t("settings.stats.resourcesTitle")}
                            stats={[
                                {
                                    icon: <Server />,
                                    title: t("settings.stats.environments"),
                                    value: projectQuery.data?.count?.environments,
                                    href: "/environments"
                                },
                                {
                                    icon: <GitBranch />,
                                    title: t("settings.stats.codeRepositories"),
                                    value: projectQuery.data?.count?.codeRepositories,
                                    href: "/code-repositories"
                                },
                                {
                                    icon: <HardDrive />,
                                    title: t("settings.stats.storages"),
                                    value: projectQuery.data?.count?.storages,
                                    href: "/storages"
                                }
                            ]}
                        />
                    </TabsContent>

                    <TabsContent value="delivery" className="mt-6 flex flex-col gap-6">
                        {projectData && (
                            <PipelineTemplatesSection
                                projectId={projectData._id}
                                pipelines={projectData.pipelines}
                                onUpdate={values => updatePipelinesMutation.mutate(values)}
                                isUpdating={updatePipelinesMutation.isPending}
                            />
                        )}
                    </TabsContent>
                </Tabs>
            </SinglePageLayout>
        </ApiStatusHandler>
    )
}

export default Settings
