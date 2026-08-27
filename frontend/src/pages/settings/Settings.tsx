import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { GitBranch, HardDrive, Key, Server, Users } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
// Components
import { ApiStatusHandler } from "@/components/organisms"
import SinglePageLayout from "@/components/SinglePageLayout"
// Hooks & Stores
import useProjectApi from "@/hooks/apiClients/useProjectApi"
import useProjectStore from "@/store/useProjectStore"
import useToastNotificationStore from "@/store/useToastNotificationStore"
import { DangerZone, ProjectInfoSection, ProjectStatsSection } from "./partials"
import type { ProjectInfoFormValues } from "./partials/ProjectInfoSection"

export const Settings: React.FC = () => {
    const notifications = useToastNotificationStore()
    const { t } = useTranslation()
    const { project, setProject } = useProjectStore()
    const projectApi = useProjectApi()
    const navigate = useNavigate()
    const queryClient = useQueryClient()

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

    const projectData = projectQuery.data?.project

    return (
        <ApiStatusHandler queries={[projectQuery]}>
            <SinglePageLayout title={t("settings.title")} description={t("settings.subtitle")}>
                {projectData && <ProjectInfoSection {...projectData} onUpdate={values => updateProjectMutation.mutate(values)} isUpdating={updateProjectMutation.isPending} />}

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
                            icon: <Key />,
                            title: t("settings.stats.apiKeys"),
                            value: projectQuery.data?.count?.apiKeys,
                            href: "/api-keys"
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
