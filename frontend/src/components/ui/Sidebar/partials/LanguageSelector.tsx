import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import useUserApi from "@/hooks/apiClients/useUserApi"
import useUserStore from "@/store/useUserStore"
import { setLanguageInLocalStorage } from "@/utils/localStorageUtils"
import { Globe } from "lucide-react"
import { useTranslation } from "react-i18next"
import { NavItem } from "./NavItem/NavItem"

const LanguageSelector: React.FC<{ isSidebarCollapsed: boolean }> = ({ isSidebarCollapsed }: { isSidebarCollapsed: boolean }) => {
    const { t, i18n } = useTranslation()
    const userApi = useUserApi()
    const userStore = useUserStore()

    const changeLanguage = (lng: string) => {
        i18n.changeLanguage(lng)
        setLanguageInLocalStorage(lng)
        if (userStore.user) {
            userApi.saveLanguage(lng)
        }
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <NavItem type="secondary" icon={<Globe />} name={t("language.change")} aria-label="Language selector" isSidebarCollapsed={isSidebarCollapsed} />
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start">
                <DropdownMenuItem onClick={() => changeLanguage("en")}>{t("language.english")}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => changeLanguage("it")}>{t("language.italian")}</DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

export default LanguageSelector
