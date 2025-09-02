import { NavItem } from "@/components/ui/Sidebar/partials/NavItem"
import { ArrowLeftFromLine, ArrowRightFromLine } from "lucide-react"
import * as React from "react"
import { Button } from "../button/button"
import { useTranslation } from "react-i18next"

export interface SidebarNavItemProps {
    name?: string
    path?: string
    icon?: React.ReactNode
    disabled?: boolean
    action?: () => void
}

export interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
    isCollapsed?: boolean
    toggleCollapsed?: () => void
    sidebarHeader?: React.ReactNode | React.ReactNode[]
    mainNavItems?: SidebarNavItemProps[]
    secondaryNavItems?: SidebarNavItemProps[]
    isMobile?: boolean
}

const Sidebar = React.forwardRef<HTMLDivElement, SidebarProps>(({ className, sidebarHeader, mainNavItems, secondaryNavItems, isMobile, isCollapsed, toggleCollapsed, ...props }, ref) => {
    const { t } = useTranslation()
    const [showCollapseButton, setShowCollapseButton] = React.useState(false)

    const mouseEnterHandler = () => setShowCollapseButton(true)
    const mouseLeaveHandler = () => setShowCollapseButton(false)

    return (
        <div
            onMouseEnter={mouseEnterHandler}
            onMouseLeave={mouseLeaveHandler}
            className={`bg-sidebar fixed h-sidebar top-2 left-2 transition-all duration-300 ease-in-out border-2 border-sidebar-border rounded-md py-6 ${!isCollapsed ? "w-64 px-3" : "w-20 px-2"}`}
        >
            <div className={`flex items-center mb-12 ${isCollapsed ? "justify-center" : "justify-start"}`}>
                <div className="flex items-center p-2 gap-3">
                    <div className="h-8 w-8 rounded-sm bg-orchestrator-accent flex items-center justify-center text-white font-bold">{!isCollapsed ? "MF" : "M"}</div>
                    {!isCollapsed && <span className="text-lg font-semibold text-orchestrator-secondary">{t("app.name")}</span>}
                </div>
            </div>

            {mainNavItems && (
                <div className="flex flex-col gap-1">
                    {mainNavItems.map(item => (
                        <NavItem key={item.path} type="main" to={item.path} icon={item.icon} name={item.name} isSidebarCollapsed={isCollapsed} disabled={item.disabled} />
                    ))}
                </div>
            )}

            {secondaryNavItems && (
                <div className="flex flex-col gap-1">
                    {secondaryNavItems.map(item => (
                        <NavItem key={item.path} type="secondary" action={item.action} icon={item.icon} name={item.name} isSidebarCollapsed={isCollapsed} disabled={item.disabled} />
                    ))}
                </div>
            )}

            <div></div>

            {showCollapseButton && (
                <Button variant="secondary" size="icon-sm" onClick={toggleCollapsed} className="absolute -bottom-2 left-1/2 -translate-x-1/2 [&_svg]:size-4">
                    {!isCollapsed ? <ArrowLeftFromLine /> : <ArrowRightFromLine />}
                </Button>
            )}
        </div>
    )
})

export { Sidebar }
