import { Spinner } from "@mfe-orchestrator/design-system"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import AuthenticationLayout from "@/authentication/components/AuthenticationLayout"
import { ApiStatusHandler } from "@/components/organisms"
import PendingInvitationsList, { usePendingInvitationsQuery } from "@/components/PendingInvitationsList"
import ProjectPickerList from "@/components/ProjectPickerList"
import useProjectApi, { Project } from "@/hooks/apiClients/useProjectApi"
import NewProjectWizard from "@/pages/new-project-wizard/NewProjectWizard"
import useProjectStore from "@/store/useProjectStore"
import { getProjectIdFromLocalStorage, setProjectIdInLocalStorage } from "@/utils/localStorageUtils"

interface SelectProjectFormProps {
    onCreateNewProject: () => void
}

const SelectProjectForm: React.FC<SelectProjectFormProps> = ({ onCreateNewProject }) => {
    const { t } = useTranslation()
    const projectStore = useProjectStore()

    // Picking a row is the whole action, so it commits straight away instead of
    // making the user confirm a dropdown choice with a second click.
    const onSelectProject = (project: Project) => {
        projectStore.setProject(project)
        setProjectIdInLocalStorage(project._id)
    }

    return (
        <AuthenticationLayout title={t("project.select_project")} description={t("project.switch_desc")} size="lg">
            {/* Invitations come first: they are the only thing on this screen that still needs an answer. */}
            <PendingInvitationsList className="mb-4" />
            <ProjectPickerList projects={projectStore.projects ?? []} onSelect={onSelectProject} onCreateNew={onCreateNewProject} variant="grid" autoFocusSearch />
        </AuthenticationLayout>
    )
}

const SelectProjectWrapperInner: React.FC<React.PropsWithChildren> = ({ children }) => {
    const projectStore = useProjectStore()
    const queryClient = useQueryClient()
    const [firstRunComplete, setFirstRunComplete] = useState(false)
    const [isCreatingProject, setIsCreatingProject] = useState(false)
    // Same query key as the list below, so this reads the cached answer instead of fetching again.
    const invitationsQuery = usePendingInvitationsQuery()

    const hasProjects = Boolean(projectStore.projects && projectStore.projects.length > 0)
    const hasPendingInvitations = Boolean(invitationsQuery.data && invitationsQuery.data.length > 0)

    // Whether the user has somewhere to go depends on the invitations too, so hold on until they arrive.
    if (!hasProjects && invitationsQuery.isPending) {
        return (
            <div className="flex min-h-[200px] items-center justify-center">
                <Spinner />
            </div>
        )
    }

    // First run: no projects yet → guide the user through the full project wizard.
    // Gated on a local flag so the wizard stays mounted for every step even though
    // step 1 already sets the active project in the store.
    // A pending invitation is a way in as well, so it takes precedence over the wizard:
    // otherwise the only screen offered would be "create a project".
    const isFirstRun = !hasProjects && !hasPendingInvitations && !firstRunComplete

    // The picker can also reach the wizard, which this component has to render itself:
    // until a project is active it shadows the routed pages, so navigating there would show nothing.
    if (isFirstRun || isCreatingProject) {
        return (
            <NewProjectWizard
                mountPoint="/project-wizard"
                onComplete={() => {
                    setFirstRunComplete(true)
                    setIsCreatingProject(false)
                    queryClient.invalidateQueries({ queryKey: ["projects-mine"] })
                }}
            />
        )
    }

    if (projectStore.project) {
        return <>{children}</>
    }

    return <SelectProjectForm onCreateNewProject={() => setIsCreatingProject(true)} />
}

const SelectProjectWrapper: React.FC<React.PropsWithChildren> = props => {
    const projectApi = useProjectApi()
    const projectStore = useProjectStore()

    const projectsQuery = useQuery({
        queryKey: ["projects-mine"],
        queryFn: async () => {
            try {
                const projects = await projectApi.getMineProjects()
                projectStore.setProjects(projects)
                if (projects.length === 1) {
                    projectStore.setProject(projects[0])
                    setProjectIdInLocalStorage(projects[0]._id)
                }
                //Here we have several projects
                const projectId = getProjectIdFromLocalStorage()
                if (projectId) {
                    projectStore.setProject(projects.find(p => p._id === projectId))
                }

                return projects
            } catch (error) {
                console.error("Error fetching projects:", error)
                throw error
            }
        }
    })

    return (
        <ApiStatusHandler queries={[projectsQuery]}>
            <SelectProjectWrapperInner {...props} />
        </ApiStatusHandler>
    )
}

export default SelectProjectWrapper
