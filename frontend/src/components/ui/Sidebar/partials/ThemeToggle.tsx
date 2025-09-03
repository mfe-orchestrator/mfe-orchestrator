import useUserApi from "@/hooks/apiClients/useUserApi"
import useThemeStore, { ThemeEnum } from "@/store/useThemeStore"
import useUserStore from "@/store/useUserStore"
import { setThemeInLocalStorage } from "@/utils/localStorageUtils"
import { Monitor, Moon, Sun } from "lucide-react"
import { useTranslation } from "react-i18next"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../dropdown-menu"
import { NavItem } from "./NavItem/NavItem"

const ThemeToggle: React.FC<{ isSidebarCollapsed: boolean }> = ({ isSidebarCollapsed }: { isSidebarCollapsed: boolean }) => {
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
            <DropdownMenuTrigger>
                <NavItem type="secondary" icon={getThemeIcon()} name={t("theme.toggle_theme")} aria-label="Theme toggle" isSidebarCollapsed={isSidebarCollapsed} />
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start">
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
