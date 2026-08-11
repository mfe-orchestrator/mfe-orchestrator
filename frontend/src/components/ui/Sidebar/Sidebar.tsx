import { Sidebar as DesignSystemSidebar, type SidebarProps as DesignSystemSidebarProps, type SidebarNavItemProps } from "@mfe-orchestrator/design-system"
import { BookOpen, GitBranch } from "lucide-react"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { Link, useLocation } from "react-router-dom"
import LanguageSelector from "./partials/LanguageSelector"
import ThemeToggle from "./partials/ThemeToggle"
import { UserButton } from "./partials/UserButton"

export type { SidebarNavItemProps }

/** Titolo, blocco secondario, footer e router li decide questo componente. */
export type SidebarProps = Omit<DesignSystemSidebarProps, "title" | "secondaryNavItems" | "secondaryContent" | "footer" | "renderLink">

const EXTERNAL_NAV_ITEMS: SidebarNavItemProps[] = [
    { name: "Documentation", path: "https://mfe-orchestrator.dev/documentation/", icon: <BookOpen /> },
    { name: "Contribute", path: "https://github.com/mfe-orchestrator", icon: <GitBranch /> }
]

const Sidebar = React.forwardRef<HTMLDivElement, SidebarProps>(({ mainNavItems, ...props }, ref) => {
    const { t } = useTranslation()
    const location = useLocation()

    return (
        <DesignSystemSidebar
            ref={ref}
            {...props}
            title={t("app.name")}
            mainNavItems={mainNavItems?.map(item => ({ ...item, active: location.pathname === item.path }))}
            secondaryNavItems={EXTERNAL_NAV_ITEMS}
            secondaryContent={({ isCollapsed, isMobile }) => (
                <>
                    <LanguageSelector isSidebarCollapsed={isCollapsed} dropdownContentSide={isMobile ? "bottom" : undefined} dropdownContentAlign={isMobile ? "start" : undefined} />
                    <ThemeToggle isSidebarCollapsed={isCollapsed} dropdownContentSide={isMobile ? "bottom" : undefined} dropdownContentAlign={isMobile ? "start" : undefined} />
                </>
            )}
            footer={({ isCollapsed }) => <UserButton isSidebarCollapsed={isCollapsed} />}
            renderLink={({ href, className, children, onClick }) => (
                <Link to={href} className={className} onClick={onClick}>
                    {children}
                </Link>
            )}
        />
    )
})

Sidebar.displayName = "Sidebar"

export { Sidebar }
