import { Link, useLocation } from "react-router-dom"
import { navItemVariants } from "./NavItemVariants"
import { cn } from "@/utils/styleUtils"
import React from "react"

export interface NavItemProps extends React.HTMLAttributes<HTMLAnchorElement | HTMLButtonElement | HTMLDivElement> {
    type?: "main" | "secondary"
    to?: string
    href?: string
    icon?: React.ReactNode
    name?: string
    action?: () => void
    isSidebarCollapsed?: boolean
    disabled?: boolean
    isMobile?: boolean
    handleShowMenu?: () => void
}

export const NavItem = React.forwardRef<HTMLButtonElement | HTMLAnchorElement | HTMLDivElement, NavItemProps>(
    ({ to, href, icon, name, isSidebarCollapsed, disabled = false, type = "main", action, className, isMobile, handleShowMenu, ...props }, ref) => {
        const location = useLocation()
        const isActive = location.pathname === to

        const disabledClasses = "opacity-50 cursor-not-allowed hover:border-transparent"

        if (disabled) {
            return (
                <div ref={ref as React.Ref<HTMLDivElement>} className={cn(navItemVariants({ type, active: isActive }), disabledClasses, className)} {...props}>
                    {icon}
                    {!isSidebarCollapsed && <span>{name}</span>}
                </div>
            )
        }

        if (type === "secondary") {
            if (href) {
                return (
                    <a ref={ref as React.Ref<HTMLAnchorElement>} href={href} target="_blank" className={cn(navItemVariants({ type, active: isActive, isSidebarCollapsed }), className)} {...props}>
                        {icon}
                        {!isSidebarCollapsed && <span>{name}</span>}
                    </a>
                )
            } else {
                return (
                    <button ref={ref as React.Ref<HTMLButtonElement>} onClick={action} className={cn(navItemVariants({ type, active: isActive, isSidebarCollapsed }), className)} {...props}>
                        {icon}
                        {!isSidebarCollapsed && <span>{name}</span>}
                    </button>
                )
            }
        }

        return (
            <Link
                ref={ref as React.Ref<HTMLAnchorElement>}
                to={to}
                className={cn(navItemVariants({ type, active: isActive, isSidebarCollapsed }), className)}
                onClick={() => isMobile && handleShowMenu()}
                {...props}
            >
                {icon}
                {!isSidebarCollapsed && <span>{name}</span>}
            </Link>
        )
    }
)
