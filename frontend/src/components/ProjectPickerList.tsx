import { Input } from "@mfe-orchestrator/design-system"
import { Check, ChevronRight, FolderPlus, Plus, Search } from "lucide-react"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms"
import { Project } from "@/hooks/apiClients/useProjectApi"
import { cn } from "@/utils/styleUtils"

/** Above this many projects the list gets a search box; below it, scanning is faster than typing. */
const SEARCH_THRESHOLD = 6

interface ProjectPickerListProps {
    projects: Project[]
    /** Marks the entry that is already in use — omitted during the initial pick, when nothing is active yet. */
    activeProjectId?: string
    onSelect: (project: Project) => void
    /**
     * `grid` shows large tiles and needs room to breathe — it suits a full page.
     * `list` stays compact for the switch-project dialog.
     */
    variant?: "list" | "grid"
    /** When set, the create action is rendered by this component: as a trailing tile in `grid`, as a button in `list`. */
    onCreateNew?: () => void
    autoFocusSearch?: boolean
    className?: string
}

export const ProjectPickerList: React.FC<ProjectPickerListProps> = ({ projects, activeProjectId, onSelect, variant = "list", onCreateNew, autoFocusSearch, className }) => {
    const { t } = useTranslation()
    const [search, setSearch] = useState("")

    const filteredProjects = useMemo(() => {
        const query = search.trim().toLowerCase()
        if (!query) return projects
        return projects.filter(proj => proj.name?.toLowerCase().includes(query) || proj.description?.toLowerCase().includes(query))
    }, [projects, search])

    const createButton = onCreateNew ? (
        <Button variant="secondary" className="w-full" onClick={onCreateNew}>
            <Plus />
            {t("project.create_new")}
        </Button>
    ) : null

    if (projects.length === 0) {
        return (
            <div className={cn("flex flex-col gap-4", className)}>
                <div className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-divider bg-muted/30 py-8 text-center">
                    <div className="rounded-full bg-primary/15 p-3 text-primary">
                        <FolderPlus className="size-6" />
                    </div>
                    <p className="text-sm font-medium text-foreground">{t("project.no_projects")}</p>
                    <p className="text-xs text-foreground-secondary">{t("project.no_projects_desc")}</p>
                </div>
                {createButton}
            </div>
        )
    }

    const searchBox =
        projects.length > SEARCH_THRESHOLD ? (
            <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-secondary" aria-hidden="true" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("project.search_placeholder")} className="pl-9" fullWidth autoFocus={autoFocusSearch} />
            </div>
        ) : null

    const noResults = <p className="py-8 text-center text-sm text-foreground-secondary">{t("project.no_results")}</p>

    if (variant === "grid") {
        return (
            <div className={cn("flex flex-col gap-4", className)}>
                {searchBox}
                {filteredProjects.length > 0 ? (
                    // Capped and scrollable: the page around it cannot scroll (body has overflow hidden),
                    // so a tall grid would otherwise be cut off. The negative margin keeps focus rings visible.
                    <ul className="-mx-1 grid max-h-[55vh] grid-cols-[repeat(auto-fill,minmax(min(100%,180px),1fr))] gap-3 overflow-y-auto px-1 py-1">
                        {filteredProjects.map(proj => {
                            const isActive = Boolean(activeProjectId) && activeProjectId === proj._id

                            return (
                                <li key={proj._id}>
                                    <button
                                        type="button"
                                        onClick={() => onSelect(proj)}
                                        aria-current={isActive || undefined}
                                        title={proj.description || proj.name}
                                        className={cn(
                                            "flex aspect-square w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-lg border-2 border-divider bg-muted/40 p-3 text-center transition-colors",
                                            "hover:border-primary hover:bg-primary/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                            { "border-accent bg-accent/10 hover:bg-accent/10": isActive }
                                        )}
                                    >
                                        <span
                                            className={cn("relative flex size-14 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-xl font-semibold uppercase text-primary", {
                                                "bg-accent text-accent-foreground": isActive
                                            })}
                                            aria-hidden="true"
                                        >
                                            {proj.name?.charAt(0) ?? "?"}
                                            {isActive && (
                                                <span className="absolute -right-1 -top-1 rounded-full bg-accent p-0.5 text-accent-foreground">
                                                    <Check className="size-3" />
                                                </span>
                                            )}
                                        </span>
                                        <span className="flex min-w-0 flex-col gap-0.5">
                                            <span className="line-clamp-2 text-sm font-medium text-foreground">{proj.name}</span>
                                            {proj.description && <span className="line-clamp-2 text-xs text-foreground-secondary">{proj.description}</span>}
                                        </span>
                                    </button>
                                </li>
                            )
                        })}
                        {onCreateNew && (
                            <li>
                                <button
                                    type="button"
                                    onClick={onCreateNew}
                                    className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-divider p-3 text-center transition-colors hover:border-primary hover:bg-primary/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    <span className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary" aria-hidden="true">
                                        <Plus className="size-7" />
                                    </span>
                                    <span className="line-clamp-2 text-sm font-medium text-foreground">{t("project.create_new")}</span>
                                </button>
                            </li>
                        )}
                    </ul>
                ) : (
                    noResults
                )}
            </div>
        )
    }

    return (
        <div className={cn("flex flex-col gap-3", className)}>
            {searchBox}

            {filteredProjects.length > 0 ? (
                <ul className="-mx-1 flex max-h-[320px] flex-col gap-1.5 overflow-y-auto px-1">
                    {filteredProjects.map(proj => {
                        const isActive = Boolean(activeProjectId) && activeProjectId === proj._id

                        return (
                            <li key={proj._id}>
                                <button
                                    type="button"
                                    onClick={() => onSelect(proj)}
                                    aria-current={isActive || undefined}
                                    className={cn(
                                        "group flex w-full items-center gap-3 rounded-lg border-2 border-transparent bg-muted/40 px-3 py-2.5 text-left transition-colors",
                                        "hover:border-primary hover:bg-primary/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                        { "border-accent bg-accent/10 hover:bg-accent/10": isActive }
                                    )}
                                >
                                    <span
                                        className={cn("flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/15 text-sm font-semibold uppercase text-primary", {
                                            "bg-accent text-accent-foreground": isActive
                                        })}
                                        aria-hidden="true"
                                    >
                                        {proj.name?.charAt(0) ?? "?"}
                                    </span>
                                    <span className="flex min-w-0 flex-col">
                                        <span className="truncate text-sm font-medium text-foreground">{proj.name}</span>
                                        {proj.description && <span className="truncate text-xs text-foreground-secondary">{proj.description}</span>}
                                    </span>
                                    {isActive ? (
                                        <Check className="ml-auto size-4 shrink-0 text-accent-foreground" />
                                    ) : (
                                        <ChevronRight className="ml-auto size-4 shrink-0 text-foreground-secondary transition-transform group-hover:translate-x-0.5" />
                                    )}
                                </button>
                            </li>
                        )
                    })}
                </ul>
            ) : (
                noResults
            )}

            {createButton}
        </div>
    )
}

export default ProjectPickerList
