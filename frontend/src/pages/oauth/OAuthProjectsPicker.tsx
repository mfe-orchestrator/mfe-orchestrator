import { Badge, Checkbox, EmptyState, SearchInput } from "@mfe-orchestrator/design-system"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import type { OAuthProject } from "@/hooks/apiClients/useOAuthApi"

/** Above this many projects the list gets a search box. */
const SEARCH_THRESHOLD = 8

interface OAuthProjectsPickerProps {
    projects: OAuthProject[]
    selectedIds: string[]
    onChange: (ids: string[]) => void
    disabled?: boolean
}

/** Multi-select of projects grouped by organization, each group with a select-all. */
export const OAuthProjectsPicker: React.FC<OAuthProjectsPickerProps> = ({ projects, selectedIds, onChange, disabled }) => {
    const { t } = useTranslation()
    const [search, setSearch] = useState("")

    const groups = useMemo(() => {
        const query = search.trim().toLowerCase()
        const visible = query ? projects.filter(p => p.name.toLowerCase().includes(query) || p.organizationName.toLowerCase().includes(query)) : projects
        const byOrg = new Map<string, { id: string; name: string; projects: OAuthProject[] }>()
        for (const project of visible) {
            const group = byOrg.get(project.organizationId) ?? { id: project.organizationId, name: project.organizationName, projects: [] }
            group.projects.push(project)
            byOrg.set(project.organizationId, group)
        }
        return [...byOrg.values()]
    }, [projects, search])

    const selected = new Set(selectedIds)

    const toggle = (ids: string[], checked: boolean) => {
        const next = new Set(selected)
        for (const id of ids) {
            if (checked) next.add(id)
            else next.delete(id)
        }
        onChange([...next])
    }

    return (
        <div className="flex flex-col gap-3">
            {projects.length > SEARCH_THRESHOLD && <SearchInput value={search} onValueChange={setSearch} placeholder={t("oauth.consent.searchProjects")} />}
            {groups.length === 0 && <EmptyState size="sm" description={t("oauth.consent.noResults")} />}
            {groups.map(group => {
                const ids = group.projects.map(p => p.id)
                const selectedCount = ids.filter(id => selected.has(id)).length
                const allSelected = selectedCount === ids.length
                return (
                    <fieldset key={group.id} className="rounded-md border border-border" data-testid={`oauth-org-${group.id}`}>
                        <legend className="sr-only">{group.name}</legend>
                        <div className="flex items-center gap-3 border-b border-border bg-muted/40 p-3">
                            <Checkbox
                                id={`oauth-org-all-${group.id}`}
                                checked={allSelected ? true : selectedCount > 0 ? "indeterminate" : false}
                                disabled={disabled}
                                onCheckedChange={checked => toggle(ids, checked === true)}
                                aria-label={t("oauth.consent.selectAllIn", { organization: group.name })}
                            />
                            <label htmlFor={`oauth-org-all-${group.id}`} className="flex-1 font-semibold">
                                {group.name}
                            </label>
                            <span className="text-sm text-muted-foreground">{t("oauth.consent.selectAll")}</span>
                        </div>
                        <ul>
                            {group.projects.map(project => (
                                <li key={project.id} className="flex items-center gap-3 p-3">
                                    <Checkbox
                                        id={`oauth-project-${project.id}`}
                                        checked={selected.has(project.id)}
                                        disabled={disabled}
                                        onCheckedChange={checked => toggle([project.id], checked === true)}
                                    />
                                    <label htmlFor={`oauth-project-${project.id}`} className="flex-1">
                                        {project.name}
                                    </label>
                                    <Badge variant="outline">{project.role}</Badge>
                                </li>
                            ))}
                        </ul>
                    </fieldset>
                )
            })}
        </div>
    )
}

export default OAuthProjectsPicker
