import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@mfe-orchestrator/design-system"
import { Plus, Repeat } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/atoms"
import PendingInvitationsList from "@/components/PendingInvitationsList"
import ProjectPickerList from "@/components/ProjectPickerList"
import useProjectApi, { Project } from "@/hooks/apiClients/useProjectApi"
import useProjectStore from "@/store/useProjectStore"
import { setProjectIdInLocalStorage } from "@/utils/localStorageUtils"

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
        // Closing unmounts the dialog content, so the picker's search box resets itself.
    }

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button variant="primary" size="sm">
                    <Repeat />
                    <span>{t("project.switch_or_create", { defaultValue: "Switch or create project" })}</span>
                    <Plus />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[440px]">
                <DialogHeader>
                    <DialogTitle>{t("project.switch_or_create", { defaultValue: "Switch or create project" })}</DialogTitle>
                    <DialogDescription>{t("project.switch_desc", { defaultValue: "Select a project to work on or create a new one." })}</DialogDescription>
                </DialogHeader>
                <div className="pt-2">
                    {/* Accepting turns the invitation into a project, so the list underneath has to be reloaded. */}
                    <PendingInvitationsList className="mb-4" onAccepted={loadProjects} />
                    <ProjectPickerList projects={projects} activeProjectId={project?._id} onSelect={handleProjectSelect} autoFocusSearch className="mb-4" />
                    <div className="border-t border-divider pt-4">
                        <Button variant="primary" size="sm" className="w-full" onClick={() => navigate("/project-wizard")}>
                            <Plus />
                            <span>{t("project.create_new")}</span>
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

export default SwitchProjectButton
