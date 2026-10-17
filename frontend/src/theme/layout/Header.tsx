import { ChevronRight, Settings } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Link, NavLink } from "react-router-dom"
import AssistantToggleButton from "@/components/assistant/AssistantToggleButton"
import SwitchOrganizationButton from "@/components/SwitchOrganizationButton"
import SwitchProjectButton from "@/components/SwitchProjectButton"
import useOrganizationStore from "@/store/useOrganizationStore"
import useProjectStore from "@/store/useProjectStore"
import { cn } from "@/utils/styleUtils"

/** Il menu in alto: le pagine che valgono per tutto il progetto. L'agente a tutta pagina sta in sidebar. */
const HeaderMenu: React.FC = () => {
    const { t } = useTranslation()

    const items = [{ name: t("settings.title"), path: "/settings", icon: <Settings />, dataTestId: "header-menu-settings" }]

    return (
        <nav aria-label={t("navigation.top_menu")} className="flex items-center gap-1">
            {items.map(item => (
                <NavLink
                    key={item.path}
                    to={item.path}
                    title={item.name}
                    data-testid={item.dataTestId}
                    className={({ isActive }) =>
                        cn(
                            "inline-flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-foreground-secondary transition-colors hover:bg-primary/5 hover:text-foreground [&_svg]:size-4 lg:px-3",
                            isActive && "bg-primary/10 text-foreground"
                        )
                    }
                >
                    {item.icon}
                    {/* Sotto lg restano le icone: l'etichetta passa agli screen reader. */}
                    <span className="sr-only lg:not-sr-only">{item.name}</span>
                </NavLink>
            ))}
        </nav>
    )
}

const Header: React.FC = () => {
    const { project } = useProjectStore()
    const { organization } = useOrganizationStore()

    return (
        <header className="bg-background border-b border-divider flex items-center justify-between gap-2 px-1 mx-2 pt-2 pb-4">
            {/* Organization first, then project: the project name alone does not say which tenant it is in. */}
            <h1 className="flex min-w-0 items-center gap-1 text-lg font-semibold text-foreground-secondary">
                {organization && (
                    <>
                        {/* Cliccabile: e' la strada breve verso l'organizzazione, che dalla sidebar non passa piu. */}
                        <Link to="/organization" className="hidden truncate text-base font-normal hover:text-foreground hover:underline sm:inline" data-testid="header-organization-link">
                            {organization.name}
                        </Link>
                        <ChevronRight className="hidden size-4 shrink-0 sm:inline" aria-hidden="true" />
                    </>
                )}
                <span className="truncate">{project?.name}</span>
            </h1>
            <div className="flex shrink-0 items-center gap-2">
                <HeaderMenu />
                <div className="h-6 w-px bg-divider" aria-hidden="true" />
                <SwitchOrganizationButton />
                <SwitchProjectButton />
                <AssistantToggleButton />
            </div>
        </header>
    )
}

export default Header
