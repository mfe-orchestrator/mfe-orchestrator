import { Sidebar as DesignSystemSidebar, type SidebarProps as DesignSystemSidebarProps, type SidebarNavItemProps } from "@mfe-orchestrator/design-system"
import { BookOpen, GitBranch } from "lucide-react"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { Link, useLocation } from "react-router-dom"
import LanguageSelector from "./partials/LanguageSelector"
import ThemeToggle from "./partials/ThemeToggle"
import { UserButton } from "./partials/UserButton"

export type { SidebarNavItemProps }

/** Una sezione della navigazione principale: un titolo e le sue voci. Senza titolo, le voci stanno in testa da sole. */
export interface SidebarNavSection {
    title?: string
    items: SidebarNavItemProps[]
}

/** Logo, titolo, blocco secondario, footer e router li decide questo componente. */
export type SidebarProps = Omit<DesignSystemSidebarProps, "logo" | "title" | "mainNavItems" | "secondaryNavItems" | "secondaryContent" | "footer" | "renderLink"> & {
    mainNavSections: SidebarNavSection[]
}

const EXTERNAL_NAV_ITEMS: SidebarNavItemProps[] = [
    { name: "Documentation", path: "https://mfe-orchestrator.dev/documentation/", icon: <BookOpen /> },
    { name: "Contribute", path: "https://github.com/mfe-orchestrator", icon: <GitBranch /> }
]

/**
 * A section stays highlighted on its detail pages: `/services` also covers `/service/:id/...`, and
 * `/microfrontends` covers `/microfrontend/:id/...` (detail routes use the singular path).
 */
const isActivePath = (pathname: string, path: string) => pathname === path || (path.endsWith("s") && pathname.startsWith(`${path.slice(0, -1)}/`))

/** Compressa, la sidebar mostra solo un separatore: il titolo resta agli screen reader. */
const SectionTitle: React.FC<{ title: string; isCollapsed?: boolean }> = ({ title, isCollapsed }) =>
    isCollapsed ? (
        <h2 className="mx-2 mt-2 mb-1 border-t border-divider first:mt-0 first:border-t-0">
            <span className="sr-only">{title}</span>
        </h2>
    ) : (
        <h2 className="px-4 pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-foreground-secondary first:pt-0">{title}</h2>
    )

const Sidebar = React.forwardRef<HTMLDivElement, SidebarProps>(({ mainNavSections, ...props }, ref) => {
    const { t } = useTranslation()
    const location = useLocation()

    const mainNavItems = mainNavSections.flatMap(section => section.items).map(item => ({ ...item, active: item.path ? isActivePath(location.pathname, item.path) : false }))
    // La sidebar del design system accetta una lista piatta: il titolo di una sezione lo rende la sua prima voce.
    const sectionTitleByPath = new Map(mainNavSections.flatMap(section => (section.title && section.items[0]?.path ? [[section.items[0].path, section.title] as const] : [])))

    return (
        <DesignSystemSidebar
            ref={ref}
            {...props}
            title={t("app.name")}
            logo={<img src="/img/logo.png" alt={t("app.name")} className="h-8 w-8" />}
            mainNavItems={mainNavItems}
            secondaryNavItems={EXTERNAL_NAV_ITEMS}
            secondaryContent={({ isCollapsed, isMobile }) => (
                <>
                    <LanguageSelector isSidebarCollapsed={isCollapsed} dropdownContentSide={isMobile ? "bottom" : undefined} dropdownContentAlign={isMobile ? "start" : undefined} />
                    <ThemeToggle isSidebarCollapsed={isCollapsed} dropdownContentSide={isMobile ? "bottom" : undefined} dropdownContentAlign={isMobile ? "start" : undefined} />
                </>
            )}
            footer={({ isCollapsed }) => <UserButton isSidebarCollapsed={isCollapsed} />}
            renderLink={({ href, className, children, onClick }) => {
                const sectionTitle = sectionTitleByPath.get(href)
                return (
                    <>
                        {sectionTitle && <SectionTitle title={sectionTitle} isCollapsed={props.isCollapsed} />}
                        <Link to={href} className={className} onClick={onClick}>
                            {children}
                        </Link>
                    </>
                )
            }}
        />
    )
})

Sidebar.displayName = "Sidebar"

export { Sidebar }
