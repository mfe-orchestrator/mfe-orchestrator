import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { FormProvider, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import AuthenticationLayout from "@/authentication/components/AuthenticationLayout"
import { Button } from "@/components/atoms"
import SelectField from "@/components/input/SelectField.rhf"
import { ApiStatusHandler } from "@/components/organisms"
import useProjectApi, { Project } from "@/hooks/apiClients/useProjectApi"
import NewProjectWizard from "@/pages/new-project-wizard/NewProjectWizard"
import useProjectStore from "@/store/useProjectStore"
import { getProjectIdFromLocalStorage, setProjectIdInLocalStorage } from "@/utils/localStorageUtils"

interface SelectProjectFormData {
    projectId: string
}

const SelectProjectForm: React.FC = () => {
    const { t } = useTranslation()
    const form = useForm<SelectProjectFormData>()
    const projectStore = useProjectStore()

    const onSubmit = async (data: SelectProjectFormData) => {
        try {
            // Handle project selection
            const selectedProject = projectStore.projects?.find(p => p._id === data.projectId)
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
                            options={projectStore.projects?.map((project: Project) => ({
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

const SelectProjectWrapperInner: React.FC<React.PropsWithChildren> = ({ children }) => {
    const projectStore = useProjectStore()
    const queryClient = useQueryClient()
    const [firstRunComplete, setFirstRunComplete] = useState(false)

    const hasProjects = Boolean(projectStore.projects && projectStore.projects.length > 0)

    // First run: no projects yet → guide the user through the full project wizard.
    // Gated on a local flag so the wizard stays mounted for every step even though
    // step 1 already sets the active project in the store.
    if (!hasProjects && !firstRunComplete) {
        return (
            <NewProjectWizard
                mountPoint="/project-wizard"
                onComplete={() => {
                    setFirstRunComplete(true)
                    queryClient.invalidateQueries({ queryKey: ["projects-mine"] })
                }}
            />
        )
    }

    if (projectStore.project) {
        return <>{children}</>
    }

    return <SelectProjectForm />
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
