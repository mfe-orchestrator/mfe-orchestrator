import type { LucideIcon } from "lucide-react"
import { ArrowLeft } from "lucide-react"
import { Link, NavLink } from "react-router-dom"
import PageHead from "@/components/PageHead"
import { cn } from "@/utils/styleUtils"

export interface WorkspaceTab {
    to: string
    label: string
    icon: LucideIcon
    /** Matches the path alone, not the screens below it: the landing screen of an entity sits on its bare path. */
    end?: boolean
}

interface WorkspaceHeaderProps {
    back: { to: string; label: string }
    title: string
    /** The screen open, after the name in the browser tab. */
    pageTitle: string
    /** Under the name: slug, version, repository and the like. */
    meta?: React.ReactNode
    navLabel: string
    /** The screens of the entity; the switcher is left out with fewer than two. */
    tabs: WorkspaceTab[]
    actions?: React.ReactNode
}

const navLinkClassName = ({ isActive }: { isActive: boolean }) =>
    cn(
        "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isActive ? "bg-background text-foreground shadow-sm" : "text-foreground-secondary hover:text-foreground"
    )

/** The frame of every screen of a microfrontend, a service or a domain, so switching between them, and between them and Edit with AI, keeps the same layout. */
export const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({ back, title, pageTitle, meta, navLabel, tabs, actions }) => (
    <header className="flex flex-col gap-4">
        <PageHead title={`${title} · ${pageTitle}`} />
        <Link to={back.to} className="inline-flex w-fit items-center gap-1 text-sm text-foreground-secondary underline-offset-4 hover:text-foreground hover:underline">
            <ArrowLeft className="size-4" aria-hidden="true" />
            {back.label}
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
                <h1 className="break-words text-2xl font-bold text-foreground">{title}</h1>
                {meta && <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-foreground-secondary">{meta}</div>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
                {actions}
                {tabs.length > 1 && (
                    <nav aria-label={navLabel} className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
                        {tabs.map(({ to, label, icon: Icon, end }) => (
                            <NavLink key={to} to={to} end={end} className={navLinkClassName}>
                                <Icon className="size-4" aria-hidden="true" />
                                {label}
                            </NavLink>
                        ))}
                    </nav>
                )}
            </div>
        </div>
    </header>
)

export default WorkspaceHeader
