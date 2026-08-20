import { AddTile, EmptyState, SearchInput } from "@mfe-orchestrator/design-system"
import { Check, ChevronRight, FolderPlus, Plus } from "lucide-react"
import { useMemo, useState } from "react"
import { Button } from "@/components/atoms"
import { cn } from "@/utils/styleUtils"

/** Above this many entries the list gets a search box; below it, scanning is faster than typing. */
const SEARCH_THRESHOLD = 6

/** The little a picker needs to know about what it is listing: everything else is a label. */
export interface PickableEntity {
    _id: string
    name: string
    description?: string
}

/** What the picker calls the thing it lists, so the same component can offer projects or organizations. */
export interface EntityPickerLabels {
    emptyTitle: string
    emptyDescription: string
    createNew: string
    searchPlaceholder: string
    noResults: string
}

export interface EntityPickerListProps<T extends PickableEntity> {
    items: T[]
    labels: EntityPickerLabels
    /** Marks the entry that is already in use — omitted during the initial pick, when nothing is active yet. */
    activeId?: string
    onSelect: (item: T) => void
    /**
     * `grid` shows large tiles and needs room to breathe — it suits a full page.
     * `list` stays compact for the switch dialog.
     */
    variant?: "list" | "grid"
    /** When set, the create action is rendered by this component: as a trailing tile in `grid`, as a button in `list`. */
    onCreateNew?: () => void
    autoFocusSearch?: boolean
    className?: string
    /** Prefix of the `data-testid` put on every row, so the tests can tell one picker from another. */
    testIdPrefix?: string
}

/**
 * The picker shared by the project and the organization switcher.
 *
 * Both list the same shape — a name, a description, one active entry, a way to create a new one — and
 * keeping two copies of it meant a fix to one switcher never reached the other.
 */
export const EntityPickerList = <T extends PickableEntity>({
    items,
    labels,
    activeId,
    onSelect,
    variant = "list",
    onCreateNew,
    autoFocusSearch,
    className,
    testIdPrefix
}: EntityPickerListProps<T>) => {
    const [search, setSearch] = useState("")

    const filteredItems = useMemo(() => {
        const query = search.trim().toLowerCase()
        if (!query) return items
        return items.filter(item => item.name?.toLowerCase().includes(query) || item.description?.toLowerCase().includes(query))
    }, [items, search])

    const testIdOf = (item: T) => (testIdPrefix ? `${testIdPrefix}-${item._id}` : undefined)

    const createButton = onCreateNew ? (
        <Button variant="secondary" className="w-full" onClick={onCreateNew}>
            <Plus />
            {labels.createNew}
        </Button>
    ) : null

    if (items.length === 0) {
        return (
            <div className={cn("flex flex-col gap-4", className)}>
                {/* bg-muted/30 al posto della bg-card del DS: qui il riquadro sta dentro una superficie già chiara */}
                <EmptyState variant="outlined" size="sm" titleAs="p" icon={<FolderPlus />} title={labels.emptyTitle} description={labels.emptyDescription} className="bg-muted/30" />
                {createButton}
            </div>
        )
    }

    const searchBox = items.length > SEARCH_THRESHOLD ? <SearchInput value={search} onValueChange={setSearch} placeholder={labels.searchPlaceholder} autoFocus={autoFocusSearch} /> : null

    const noResults = <EmptyState size="sm" description={labels.noResults} />

    if (variant === "grid") {
        return (
            <div className={cn("flex flex-col gap-4", className)}>
                {searchBox}
                {filteredItems.length > 0 ? (
                    // Capped and scrollable: the page around it cannot scroll (body has overflow hidden),
                    // so a tall grid would otherwise be cut off. The negative margin keeps focus rings visible.
                    <ul className="-mx-1 grid max-h-[55vh] grid-cols-[repeat(auto-fill,minmax(min(100%,180px),1fr))] gap-3 overflow-y-auto px-1 py-1">
                        {filteredItems.map(item => {
                            const isActive = Boolean(activeId) && activeId === item._id

                            return (
                                <li key={item._id}>
                                    <button
                                        type="button"
                                        onClick={() => onSelect(item)}
                                        aria-current={isActive || undefined}
                                        title={item.description || item.name}
                                        data-testid={testIdOf(item)}
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
                                            {item.name?.charAt(0) ?? "?"}
                                            {isActive && (
                                                <span className="absolute -right-1 -top-1 rounded-full bg-accent p-0.5 text-accent-foreground">
                                                    <Check className="size-3" />
                                                </span>
                                            )}
                                        </span>
                                        <span className="flex min-w-0 flex-col gap-0.5">
                                            <span className="line-clamp-2 text-sm font-medium text-foreground">{item.name}</span>
                                            {item.description && <span className="line-clamp-2 text-xs text-foreground-secondary">{item.description}</span>}
                                        </span>
                                    </button>
                                </li>
                            )
                        })}
                        {onCreateNew && (
                            <li>
                                <AddTile aspect="square" onClick={onCreateNew} icon={<Plus />} label={labels.createNew} />
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

            {filteredItems.length > 0 ? (
                <ul className="-mx-1 flex max-h-[320px] flex-col gap-1.5 overflow-y-auto px-1">
                    {filteredItems.map(item => {
                        const isActive = Boolean(activeId) && activeId === item._id

                        return (
                            <li key={item._id}>
                                <button
                                    type="button"
                                    onClick={() => onSelect(item)}
                                    aria-current={isActive || undefined}
                                    data-testid={testIdOf(item)}
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
                                        {item.name?.charAt(0) ?? "?"}
                                    </span>
                                    <span className="flex min-w-0 flex-col">
                                        <span className="truncate text-sm font-medium text-foreground">{item.name}</span>
                                        {item.description && <span className="truncate text-xs text-foreground-secondary">{item.description}</span>}
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

export default EntityPickerList
