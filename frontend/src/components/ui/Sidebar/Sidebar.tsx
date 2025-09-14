import { NavItem } from "@/components/ui/Sidebar/partials/NavItem/NavItem"
import { ArrowLeftFromLine, ArrowRightFromLine, Github, BookOpen, Menu } from "lucide-react"
import * as React from "react"
import { Button } from "../button/button"
import { useTranslation } from "react-i18next"
import { UserButton } from "./partials/UserButton"
import LanguageSelector from "./partials/LanguageSelector"
import ThemeToggle from "./partials/ThemeToggle"
import { cn } from "@/utils/styleUtils"

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
}

const Sidebar = React.forwardRef<HTMLDivElement, SidebarProps>(({ className, sidebarHeader, mainNavItems, isCollapsed, toggleCollapsed, ...props }, ref) => {
    const { t } = useTranslation()

    const [isMobile, setIsMobile] = React.useState(window.matchMedia("(max-width: 767px)").matches)
    const [isMenuVisible, setIsMenuVisible] = React.useState(false)

    React.useEffect(() => {
        window.addEventListener("resize", () => {
            setIsMobile(window.matchMedia("(max-width: 767px)").matches)
        })
    }, [])

    React.useEffect(() => {
        if (isMenuVisible) {
            handleShowMenu()
        }
    }, [isMobile])

    const handleShowMenu = () => {
        setIsMenuVisible(!isMenuVisible)
        document.querySelector("#sidebar_menu")?.classList.toggle("hidden")
        document.querySelector("#sidebar_menu")?.classList.toggle("flex")
        document.querySelector("#sidebar_container")?.classList.toggle("h-sidebar")
        document.querySelector("#main_content")?.classList.toggle("hidden")
    }

    const navBarStyle = `
		w-full p-4 sticky top-2 z-10 bg-sidebar h-fit flex flex-col transition-all duration-300 ease-in-out border-2 border-sidebar-border rounded-md
	`

    const sidebarStyle = `md:relative md:top-0 md:h-sidebar md:py-6 group ${!isCollapsed ? "md:w-64 md:px-3" : "md:w-20 md:px-2"}`

    return (
        <div id="sidebar_container" className={cn(navBarStyle, sidebarStyle, className)}>
            <div className={`flex items-center justify-between md:mb-12 ${isCollapsed ? "md:justify-center" : "md:justify-start"}`}>
                <div className="flex items-center md:p-2 gap-3">
                    <div className="h-8 w-8 rounded-sm bg-orchestrator-accent flex items-center justify-center text-white font-bold">{!isCollapsed ? "MF" : "M"}</div>
                    {!isCollapsed && <span className="text-lg font-semibold text-orchestrator-secondary">{t("app.name")}</span>}
                </div>
                <Button variant="ghost" size="icon" className="md:hidden" onClick={handleShowMenu}>
                    <Menu />
                </Button>
            </div>

            <div id="sidebar_menu" className="hidden flex-col flex-grow border-t border-divider overflow-auto md:flex md:border-0 pt-2 md:pt-0 mt-4 md:mt-0">
                {mainNavItems && (
                    <nav className="flex flex-col gap-1 flex-grow">
                        {mainNavItems.map(item => (
                            <NavItem
                                key={item.path}
                                type="main"
                                to={item.path}
                                icon={item.icon}
                                name={item.name}
                                isSidebarCollapsed={isCollapsed}
                                disabled={item.disabled}
                                isMobile={isMobile}
                                handleShowMenu={handleShowMenu}
                            />
                        ))}
                    </nav>
                )}

                <div className="flex flex-col gap-1 border-t border-divider py-2">
                    <LanguageSelector isSidebarCollapsed={isCollapsed} dropdownContentSide={isMobile ? "bottom" : undefined} dropdownContentAlign={isMobile ? "start" : undefined} />
                    <ThemeToggle isSidebarCollapsed={isCollapsed} dropdownContentSide={isMobile ? "bottom" : undefined} dropdownContentAlign={isMobile ? "start" : undefined} />
                    <NavItem type="secondary" icon={<BookOpen />} name="Documentation" href="https://mfe-orchestrator-hub.github.io/documentation/" isSidebarCollapsed={isCollapsed} />
                    <NavItem type="secondary" icon={<Github />} name="Contribute" href="https://github.com/mfe-orchestrator-hub" isSidebarCollapsed={isCollapsed} />
                </div>

                <div className="border-t border-divider pt-2">
                    <UserButton isSidebarCollapsed={isCollapsed} />
                </div>
            </div>

            <Button
                variant="secondary"
                size="icon-sm"
                tabIndex={0}
                onClick={toggleCollapsed}
                className="absolute -bottom-2 left-1/2 -translate-x-1/2 [&_svg]:size-4 invisible group-hover:visible group-focus-within:visible hidden md:inline-flex"
            >
                {!isCollapsed ? <ArrowLeftFromLine /> : <ArrowRightFromLine />}
            </Button>
        </div>
    )
})

export { Sidebar }
