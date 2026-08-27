import { useTranslation } from "react-i18next"
import EntityPickerList from "@/components/EntityPickerList"
import { Project } from "@/hooks/apiClients/useProjectApi"

interface ProjectPickerListProps {
    projects: Project[]
    /** Marks the entry that is already in use — omitted during the initial pick, when nothing is active yet. */
    activeProjectId?: string
    onSelect: (project: Project) => void
    variant?: "list" | "grid"
    onCreateNew?: () => void
    autoFocusSearch?: boolean
    className?: string
}

/** The project flavour of the shared picker: same behaviour as the organization one, different words. */
export const ProjectPickerList: React.FC<ProjectPickerListProps> = ({ projects, activeProjectId, onSelect, variant = "list", onCreateNew, autoFocusSearch, className }) => {
    const { t } = useTranslation()

    return (
        <EntityPickerList<Project>
            items={projects}
            activeId={activeProjectId}
            onSelect={onSelect}
            variant={variant}
            onCreateNew={onCreateNew}
            autoFocusSearch={autoFocusSearch}
            className={className}
            testIdPrefix="project-option"
            labels={{
                emptyTitle: t("project.no_projects"),
                emptyDescription: t("project.no_projects_desc"),
                createNew: t("project.create_new"),
                searchPlaceholder: t("project.search_placeholder"),
                noResults: t("project.no_results")
            }}
        />
    )
}

export default ProjectPickerList
