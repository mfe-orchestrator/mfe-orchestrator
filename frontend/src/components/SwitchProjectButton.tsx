import { FolderPlus, Plus, Repeat } from "lucide-react"
import { useState } from "react"
import { FormProvider, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/atoms"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import useProjectApi, { Project } from "@/hooks/apiClients/useProjectApi"
import useProjectStore from "@/store/useProjectStore"
import { setProjectIdInLocalStorage } from "@/utils/localStorageUtils"
import { cn } from "@/utils/styleUtils"
import TextareaField from "./input/TextareaField.rhf"
import TextField from "./input/TextField.rhf"

const SwitchProjectButton = () => {
    const { t } = useTranslation()
    const [isOpen, setIsOpen] = useState(false)
    const { project, projects = [], setProject, setProjects } = useProjectStore()
    const projectApi = useProjectApi()
    const navigate = useNavigate()

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
                    <DialogTitle>{t("project.switch")}</DialogTitle>
                </DialogHeader>
                <div className="pt-4">
                    {projects && projects.length > 1 ? (
                        <div className="mb-4 flex flex-col gap-2">
                            {projects?.map(proj => (
                                <div
                                    key={proj._id}
                                    onClick={() => handleProjectSelect(proj)}
                                    className={cn(`flex items-center px-3 py-2 rounded-md cursor-pointer border-2 border-transparent hover:border-accent/25`, {
                                        "border-accent hover:border-accent": project?._id === proj._id
                                    })}
                                >
                                    <span className="truncate">{proj.name}</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="mb-4 flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 py-8 text-center">
                            <div className="rounded-full bg-muted p-3 text-muted-foreground">
                                <FolderPlus className="h-6 w-6" />
                            </div>
                            <div className="text-sm font-medium text-foreground/90">{t("project.no_projects", { defaultValue: "No projects yet" })}</div>
                            <div className="text-xs text-muted-foreground">{t("project.no_projects_desc", { defaultValue: "Create your first project to get started." })}</div>
                        </div>
                    )}
                    {/* <CreateNewProjectForm onSuccess={() => setIsOpen(false)} /> */}
                    <Button variant="primary" size="sm" className="w-full" onClick={() => navigate("/project-wizard")}>
                        <Plus />
                        <span>{t("project.create_new")}</span>
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

export default SwitchProjectButton
