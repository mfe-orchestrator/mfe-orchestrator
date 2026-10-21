import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Bot, Database, GitBranch, HardDrive, Key, Server, Users } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
// Components
import { ApiStatusHandler } from "@/components/organisms"
import SinglePageLayout from "@/components/SinglePageLayout"
import useGitOpsErrorMessage from "@/hooks/apiClients/useGitOpsErrorMessage"
// Hooks & Stores
import useProjectApi from "@/hooks/apiClients/useProjectApi"
import useProjectStore from "@/store/useProjectStore"
import useToastNotificationStore from "@/store/useToastNotificationStore"
import { ArgoCdSection, DangerZone, GitOpsSection, ProjectContextSection, ProjectExposureSection, ProjectInfoSection, ProjectStatsSection } from "./partials"
import type { GitOpsFormValues } from "./partials/GitOpsSection"
import type { ProjectContextFormValues } from "./partials/ProjectContextSection"
import type { ProjectExposureFormValues } from "./partials/ProjectExposureSection"
import type { ProjectInfoFormValues } from "./partials/ProjectInfoSection"

export const Settings: React.FC = () => {
    const notifications = useToastNotificationStore()
    const { t } = useTranslation()
    const { project, setProject } = useProjectStore()
    const projectApi = useProjectApi()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const gitOpsErrorMessage = useGitOpsErrorMessage()

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

    const updateExposureMutation = useMutation({
        mutationFn: (values: ProjectExposureFormValues) =>
            projectApi.updateProject(project._id, {
                // Un dominio svuotato vuol dire "non esposto", che l'API esprime con un null esplicito
                exposure: values.domain.trim() ? { domain: values.domain.trim().toLowerCase(), certificateIssuer: values.certificateIssuer.trim() || null } : null
            }),
        onSuccess: updated => {
            // Il dialog degli ambienti legge il dominio dallo store per mostrare l'host
            setProject({ ...project, exposure: updated.exposure })
            queryClient.invalidateQueries({ queryKey: ["project-summary", project._id] })
            notifications.showSuccessNotification({ message: t("settings.notifications.exposureUpdated") })
        },
        onError: () => {
            notifications.showErrorNotification({ message: t("settings.notifications.exposureUpdateFailed") })
        }
    })

    const updateGitOpsMutation = useMutation({
        mutationFn: (values: GitOpsFormValues) => projectApi.updateProject(project._id, { gitOps: values }, gitOpsErrorMessage),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["project-summary", project._id] })
            // Un repository appena creato deve comparire nell'elenco
            queryClient.invalidateQueries({ queryKey: ["importable-repositories"] })
            notifications.showSuccessNotification({ message: t("settings.gitOps.saved") })
        }
    })

    const projectData = projectQuery.data?.project

    return (
        <ApiStatusHandler queries={[projectQuery]}>
            <SinglePageLayout title={t("settings.title")} description={t("settings.subtitle")}>
                {projectData && <ProjectInfoSection {...projectData} onUpdate={values => updateProjectMutation.mutate(values)} isUpdating={updateProjectMutation.isPending} />}

                {projectData && <ProjectContextSection context={projectData.context} onUpdate={values => updateContextMutation.mutate(values)} isUpdating={updateContextMutation.isPending} />}

                {projectData && (
                    <GitOpsSection
                        projectId={projectData._id}
                        projectSlug={projectData.slug}
                        gitOps={projectData.gitOps}
                        onUpdate={values => updateGitOpsMutation.mutate(values)}
                        isUpdating={updateGitOpsMutation.isPending}
                    />
                )}

                {/* Argo CD deploya cio che il GitOps salvato committa: senza repository di configurazione non c'e' niente da consegnargli */}
                {projectData?.gitOps?.enabled && projectData.gitOps.codeRepository && (
                    <ProjectExposureSection exposure={projectData.exposure} onUpdate={values => updateExposureMutation.mutate(values)} isUpdating={updateExposureMutation.isPending} />
                )}

                {projectData?.gitOps?.enabled && projectData.gitOps.codeRepository && <ArgoCdSection projectId={projectData._id} />}

                <ProjectStatsSection
                    stats={[
                        {
                            icon: <Server />,
                            title: t("settings.stats.environments"),
                            value: projectQuery.data?.count?.environments,
                            href: "/environments"
                        },
                        {
                            icon: <Users />,
                            title: t("settings.stats.teamMembers"),
                            value: projectQuery.data?.count?.users,
                            href: "/project-users"
                        },
                        {
                            icon: <HardDrive />,
                            title: t("settings.stats.storages"),
                            value: projectQuery.data?.count?.storages,
                            href: "/storages"
                        },
                        {
                            icon: <Database />,
                            title: t("settings.stats.databases"),
                            value: projectQuery.data?.count?.databases,
                            href: "/databases"
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
                        },
                        {
                            icon: <GitBranch />,
                            title: t("settings.stats.codeRepositories"),
                            value: projectQuery.data?.count?.codeRepositories,
                            href: "/code-repositories"
                        }
                    ]}
                />

                <DangerZone projectName={projectData?.name} projectId={projectData?._id} onDeleteSuccess={handleDeleteProjectSuccess} />
            </SinglePageLayout>
        </ApiStatusHandler>
    )
}

export default Settings
