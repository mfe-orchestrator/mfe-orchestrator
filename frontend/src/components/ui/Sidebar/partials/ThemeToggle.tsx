import useUserApi from "@/hooks/apiClients/useUserApi"
import useThemeStore, { ThemeEnum } from "@/store/useThemeStore"
import useUserStore from "@/store/useUserStore"
import { setThemeInLocalStorage } from "@/utils/localStorageUtils"
import { Monitor, Moon, Sun } from "lucide-react"
import { useTranslation } from "react-i18next"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../dropdown-menu"
import { NavItem } from "./NavItem/NavItem"
import { Button } from "../../button/button"

interface ThemeToggleProps {
    isSidebarCollapsed?: boolean
    purpose?: "sidebar" | "page"
    dropdownContentSide?: "top" | "right" | "bottom" | "left"
    dropdownContentAlign?: "start" | "center" | "end"
}

const ThemeToggle: React.FC<ThemeToggleProps> = ({ isSidebarCollapsed, purpose = "sidebar", dropdownContentSide, dropdownContentAlign }: ThemeToggleProps) => {
    const { t } = useTranslation()
    const { theme, setTheme } = useThemeStore()
    const { user } = useUserStore()
    const userApi = useUserApi()

    const onSetTheme = (theme: ThemeEnum) => {
        setTheme(theme)
        setThemeInLocalStorage(theme)
        if (user) {
            userApi.saveTheme(theme)
        }
    }

    const getThemeIcon = () => {
        switch (theme) {
            case ThemeEnum.DARK:
                return <Moon />
            case ThemeEnum.LIGHT:
                return <Sun />
            case ThemeEnum.SYSTEM:
            default:
                return <Monitor />
        }
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                {purpose === "page" ? (
                    <Button variant="ghost" size="icon" aria-label="Language selector">
                        {getThemeIcon()}
                    </Button>
                ) : (
                    <NavItem type="secondary" icon={getThemeIcon()} name={t("theme.toggle_theme")} aria-label="Theme toggle" isSidebarCollapsed={isSidebarCollapsed} />
                )}
            </DropdownMenuTrigger>
            <DropdownMenuContent side={dropdownContentSide || purpose === "page" ? "bottom" : "right"} align={dropdownContentAlign || purpose === "page" ? "end" : "start"}>
                <DropdownMenuItem onClick={() => onSetTheme(ThemeEnum.LIGHT)}>
                    <Sun className="mr-2 h-4 w-4" />
                    <span>{t("theme.light")}</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onSetTheme(ThemeEnum.DARK)}>
                    <Moon className="mr-2 h-4 w-4" />
                    <span>{t("theme.dark")}</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onSetTheme(ThemeEnum.SYSTEM)}>
                    <Monitor className="mr-2 h-4 w-4" />
                    <span>{t("theme.system")}</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

export default ThemeToggle
