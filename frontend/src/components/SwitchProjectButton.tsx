import { Button } from "@/components/ui/button/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import useProjectApi, { Project } from "@/hooks/apiClients/useProjectApi"
import useProjectStore from "@/store/useProjectStore"
import { setProjectIdInLocalStorage } from "@/utils/localStorageUtils"
import { cn } from "@/utils/styleUtils"
import { Repeat } from "lucide-react"
import { useState } from "react"
import { FormProvider, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import TextareaField from "./input/TextareaField.rhf"
import TextField from "./input/TextField.rhf"

interface CreateNewProjectFormData {
    name: string
    description: string
}

interface CreateNewProjectFormProps {
    onSuccess?: () => void
}
const CreateNewProjectForm: React.FC<CreateNewProjectFormProps> = ({ onSuccess }) => {
    const { t } = useTranslation()
    const form = useForm<CreateNewProjectFormData>()

    const projectApi = useProjectApi()
    const projectStore = useProjectStore()

    const onSubmit = async (values: CreateNewProjectFormData) => {
        const newProject = await projectApi.createProject({
            name: values.name,
            slug: values.name.toLowerCase().replace(/\s+/g, '-'),
            description: values.description
        })

        // Update the projects list in the store
        projectStore.setProjects([...projectStore.projects, newProject])
        projectStore.setProject(newProject)
        setProjectIdInLocalStorage(newProject._id)

        onSuccess?.()
        form.reset()
    }

    return (
        <FormProvider {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
                <div className="space-y-4">
                    <TextField name="name" label={t("project.name")} placeholder={t("project.name_placeholder")} rules={{ required: t("validation.required") }} required />
                    <TextareaField name="description" label={t("project.description")} placeholder={t("project.description_placeholder")} className="min-h-[100px]" maxLength={500} />
                    <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                        {t("project.create")}
                    </Button>
                </div>
            </form>
        </FormProvider>
    )
}

const SwitchProjectButton = () => {
    const { t } = useTranslation()
    const [isOpen, setIsOpen] = useState(false)
    const { project, projects = [], setProject, setProjects } = useProjectStore()
    const projectApi = useProjectApi()

    const handleProjectSelect = (selectedProject: Project) => {
        setProject(selectedProject)
        setProjectIdInLocalStorage(selectedProject._id)
        setIsOpen(false)
    }

    const loadProjects = async () => {
        try {
            const projects = await projectApi.getMineProjects()
            setProjects(projects)
        } catch (error) {
            console.error("Failed to load projects:", error)
        }
    }

    const handleOpenChange = (open: boolean) => {
        setIsOpen(open)
        if (open) {
            loadProjects()
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button variant="secondary" size="sm">
                    <Repeat />
                    <span>{t("project.switch")}</span>
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{projects && projects.length > 1 ? t("project.switch") : t("project.create_new")}</DialogTitle>
                </DialogHeader>
                <div className="pt-4">
                    {projects && projects.length > 1 && (
                        <div className="mb-4 flex flex-col gap-2">
                            {projects?.map(proj => (
                                <div
                                    key={proj._id}
                                    onClick={() => handleProjectSelect(proj)}
                                    className={cn(`flex items-center px-3 py-2 rounded-md cursor-pointer border-2 border-transparent hover:border-accent/25`, { "border-accent hover:border-accent": project?._id === proj._id })}
                                >
                                    <span className="truncate">{proj.name}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    <CreateNewProjectForm onSuccess={() => setIsOpen(false)} />
                </div>
            </DialogContent>
        </Dialog>
    )
}

export default SwitchProjectButton
