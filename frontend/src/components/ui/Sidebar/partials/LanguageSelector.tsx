import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import useUserApi from "@/hooks/apiClients/useUserApi"
import useUserStore from "@/store/useUserStore"
import { setLanguageInLocalStorage } from "@/utils/localStorageUtils"
import { Globe } from "lucide-react"
import { useTranslation } from "react-i18next"
import { NavItem } from "./NavItem/NavItem"
import { Button } from "../../button/button"

interface LanguageSelectorProps {
    isSidebarCollapsed?: boolean
    purpose?: "sidebar" | "page"
}

const LanguageSelector: React.FC<LanguageSelectorProps> = ({ isSidebarCollapsed, purpose = "sidebar" }: LanguageSelectorProps) => {
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
                {purpose === "page" ? (
                    <Button variant="ghost" size="icon" aria-label="Language selector">
                        {<Globe />}
                    </Button>
                ) : (
                    <NavItem type="secondary" icon={<Globe />} name={t("language.change")} aria-label="Language selector" isSidebarCollapsed={isSidebarCollapsed} />
                )}
            </DropdownMenuTrigger>
            <DropdownMenuContent side={purpose === "page" ? "bottom" : "right"} align={purpose === "page" ? "end" : "start"}>
                <DropdownMenuItem onClick={() => changeLanguage("en")}>{t("language.english")}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => changeLanguage("it")}>{t("language.italian")}</DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

export default LanguageSelector
