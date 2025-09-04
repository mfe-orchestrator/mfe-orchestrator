import { Link, useLocation } from "react-router-dom"
import { navItemVariants } from "./NavItemVariants"
import { cn } from "@/utils/styleUtils"

export interface NavItemProps extends React.HTMLAttributes<HTMLAnchorElement> {
    type?: "main" | "secondary"
    to?: string
    href?: string
    icon?: React.ReactNode
    name?: string
    action?: () => void
    isSidebarCollapsed?: boolean
    disabled?: boolean
}

export const NavItem = ({ to, href, icon, name, isSidebarCollapsed, disabled = false, type = "main", action, className }: NavItemProps) => {
    const location = useLocation()
    const isActive = location.pathname === to

    const Comp = type === "main" ? Link : "button"

    const disabledClasses = "opacity-50 cursor-not-allowed hover:border-transparent"

    if (disabled) {
        return (
            <div className={cn(navItemVariants({ type, active: isActive }), disabledClasses, className)}>
                {icon}
                {!isSidebarCollapsed && <span>{name}</span>}
            </div>
        )
    }

    if(href){
        return (
            <a href={href} className={cn(navItemVariants({ type, active: isActive, isSidebarCollapsed }), className)}>
                {icon}
                {!isSidebarCollapsed && <a href={href} target="_blank">{name}</a>}
            </a>
        )
    }

    return (
        <Comp to={type === "main" && to} onClick={type === "secondary" && action} className={cn(navItemVariants({ type, active: isActive, isSidebarCollapsed }), className)}>
            {icon}
            {!isSidebarCollapsed && <span>{name}</span>}
        </Comp>
    )
}
