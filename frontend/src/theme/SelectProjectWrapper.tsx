import { useQuery } from "@tanstack/react-query"
import { FormProvider, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Navigate } from "react-router-dom"
import AuthenticationLayout from "@/authentication/components/AuthenticationLayout"
import { Button } from "@/components/atoms"
import SelectField from "@/components/input/SelectField.rhf"
import { ApiStatusHandler } from "@/components/organisms"
import useProjectApi, { Project } from "@/hooks/apiClients/useProjectApi"
import useProjectStore from "@/store/useProjectStore"
import { getWizardStepPath, isProjectLockedByWizard } from "@/types/ProjectWizardDTO"
import { getProjectIdFromLocalStorage, setProjectIdInLocalStorage } from "@/utils/localStorageUtils"

interface SelectProjectFormData {
    projectId: string
}

const isUsable = (project: Project) => !isProjectLockedByWizard(project.wizard)

const SelectProjectForm: React.FC<{ projects: Project[] }> = ({ projects }) => {
    const { t } = useTranslation()
    const form = useForm<SelectProjectFormData>()
    const projectStore = useProjectStore()

    const onSubmit = async (data: SelectProjectFormData) => {
        try {
            // Handle project selection
            const selectedProject = projects.find(p => p._id === data.projectId)
            if (selectedProject) {
                projectStore.setProject(selectedProject)
                setProjectIdInLocalStorage(selectedProject._id)
            }
        } catch (error) {
            console.error(t("common.error"), error)
        }
    }

    return (
        <AuthenticationLayout title={t("project.select_project")}>
            <FormProvider {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="flex flex-col gap-4">
                        <SelectField
                            name="projectId"
                            className="p-2 border rounded-md w-full"
                            rules={{ required: t("validation.required") }}
                            options={projects.map((project: Project) => ({
                                value: project._id,
                                label: project.name
                            }))}
                        />
                        <div className="flex justify-end">
                            <Button type="submit">{t("common.select")}</Button>
                        </div>
                    </div>
                </form>
            </FormProvider>
        </AuthenticationLayout>
    )
}

/**
 * Gate of the console: a project whose creation wizard is still running cannot
 * be opened, the user is sent (back) to the wizard instead. The lock is decided
 * by the backend, this only follows it.
 */
const SelectProjectWrapperInner: React.FC<React.PropsWithChildren> = ({ children }) => {
    const projectStore = useProjectStore()

    const projects = projectStore.projects ?? []
    const usableProjects = projects.filter(isUsable)
    const lockedProject = projects.find(project => !isUsable(project))

    // Nothing usable yet: either resume the wizard left running or start one.
    if (usableProjects.length === 0) {
        if (lockedProject?.wizard) {
            return <Navigate to={getWizardStepPath(lockedProject._id, lockedProject.wizard.currentStepSlug)} replace />
        }
        return <Navigate to="/project-wizard/new" replace />
    }

    // The wizard status always comes from the list: the project kept in the
    // store may have been stored before the wizard was completed.
    const activeProject = projects.find(project => project._id === projectStore.project?._id)
    if (activeProject && !isUsable(activeProject) && activeProject.wizard) {
        return <Navigate to={getWizardStepPath(activeProject._id, activeProject.wizard.currentStepSlug)} replace />
    }

    if (projectStore.project) {
        return <>{children}</>
    }

    return <SelectProjectForm projects={usableProjects} />
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

                // Projects still locked by their wizard cannot be selected
                const usableProjects = projects.filter(isUsable)
                if (usableProjects.length === 1) {
                    projectStore.setProject(usableProjects[0])
                    setProjectIdInLocalStorage(usableProjects[0]._id)
                }
                //Here we have several projects
                const projectId = getProjectIdFromLocalStorage()
                if (projectId) {
                    const storedProject = usableProjects.find(p => p._id === projectId)
                    if (storedProject) {
                        projectStore.setProject(storedProject)
                    }
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
