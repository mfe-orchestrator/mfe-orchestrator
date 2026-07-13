import { Check, FolderPlus, Plus, Repeat, Search } from "lucide-react"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/atoms"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input/input"
import useProjectApi, { Project } from "@/hooks/apiClients/useProjectApi"
import useProjectStore from "@/store/useProjectStore"
import { setProjectIdInLocalStorage } from "@/utils/localStorageUtils"
import { cn } from "@/utils/styleUtils"

const SEARCH_THRESHOLD = 6

const SwitchProjectButton = () => {
    const { t } = useTranslation()
    const [isOpen, setIsOpen] = useState(false)
    const [search, setSearch] = useState("")
    const { project, projects = [], setProject, setProjects } = useProjectStore()
    const projectApi = useProjectApi()
    const navigate = useNavigate()

    const filteredProjects = useMemo(() => {
        const query = search.trim().toLowerCase()
        if (!query) return projects
        return projects.filter(proj => proj.name?.toLowerCase().includes(query) || proj.description?.toLowerCase().includes(query))
    }, [projects, search])

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
        } else {
            setSearch("")
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
            <DialogContent className="sm:max-w-[440px]">
                <DialogHeader>
                    <DialogTitle>{t("project.switch")}</DialogTitle>
                    <DialogDescription>{t("project.switch_desc", { defaultValue: "Select a project to work on or create a new one." })}</DialogDescription>
                </DialogHeader>
                <div className="pt-2">
                    {projects && projects.length > 1 ? (
                        <>
                            {projects.length > SEARCH_THRESHOLD && (
                                <div className="relative mb-3">
                                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        value={search}
                                        onChange={e => setSearch(e.target.value)}
                                        placeholder={t("project.search_placeholder", { defaultValue: "Search projects..." })}
                                        className="h-9 w-full pl-9"
                                        autoFocus
                                    />
                                </div>
                            )}
                            {filteredProjects.length > 0 ? (
                                <div className="-mx-1 mb-4 flex max-h-[320px] flex-col gap-1.5 overflow-y-auto px-1">
                                    {filteredProjects.map(proj => {
                                        const isActive = project?._id === proj._id
                                        return (
                                            <button
                                                key={proj._id}
                                                type="button"
                                                onClick={() => handleProjectSelect(proj)}
                                                className={cn(
                                                    "group flex w-full items-center gap-3 rounded-lg border-2 border-transparent bg-muted/40 px-3 py-2.5 text-left transition-colors hover:bg-muted/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                                    { "border-accent bg-accent/10 hover:bg-accent/10": isActive }
                                                )}
                                            >
                                                <span
                                                    className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-sm font-semibold uppercase text-muted-foreground", {
                                                        "bg-accent text-accent-foreground": isActive
                                                    })}
                                                >
                                                    {proj.name?.charAt(0) ?? "?"}
                                                </span>
                                                <span className="flex min-w-0 flex-col">
                                                    <span className="truncate text-sm font-medium text-foreground">{proj.name}</span>
                                                    {proj.description && <span className="truncate text-xs text-muted-foreground">{proj.description}</span>}
                                                </span>
                                                {isActive && <Check className="ml-auto h-4 w-4 shrink-0 text-accent" />}
                                            </button>
                                        )
                                    })}
                                </div>
                            ) : (
                                <div className="mb-4 py-8 text-center text-sm text-muted-foreground">{t("project.no_results", { defaultValue: "No projects match your search." })}</div>
                            )}
                        </>
                    ) : (
                        <div className="mb-4 flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 py-8 text-center">
                            <div className="rounded-full bg-muted p-3 text-muted-foreground">
                                <FolderPlus className="h-6 w-6" />
                            </div>
                            <div className="text-sm font-medium text-foreground/90">{t("project.no_projects", { defaultValue: "No projects yet" })}</div>
                            <div className="text-xs text-muted-foreground">{t("project.no_projects_desc", { defaultValue: "Create your first project to get started." })}</div>
                        </div>
                    )}
                    <div className="border-t border-border pt-4">
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
