import { Hammer as HammerIcon, Layers, LayoutDashboard, Link as LinkIcon, Package as PackageIcon, Rocket as RocketIcon, Server } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useLocation } from "react-router-dom"
import AssistantPanel, { ASSISTANT_PAGE_PATH } from "@/components/assistant/AssistantPanel"
import { Sidebar, type SidebarNavSection } from "@/components/ui/Sidebar/Sidebar"
import { cn } from "@/utils/styleUtils"
import Header from "./Header"

interface MainLayoutProps {
    children: React.ReactNode
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
    const { t } = useTranslation()
    const location = useLocation()
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
    // La pagina dell'agente e' gia' la conversazione: il pannello laterale ne sarebbe un doppione.
    const isAssistantPage = location.pathname === ASSISTANT_PAGE_PATH

    const toggleSidebar = () => {
        setIsSidebarCollapsed(!isSidebarCollapsed)
    }

    // Solo voci di progetto: il livello organizzazione vive nell'header, dal suo menu, e le pagine
    // che valgono per tutto il progetto (variabili, impostazioni) nel menu in alto.
    const mainNavSections: SidebarNavSection[] = [
        {
            title: t("navigation.sections.domains"),
            items: [{ name: t("domains.sidebar_title"), path: "/domains", icon: <Layers /> }]
        },
        {
            title: t("navigation.sections.microfrontends"),
            items: [
                { name: "Microfrontends", path: "/microfrontends", icon: <LayoutDashboard /> },
                { name: t("dependencies.sidebar_title"), path: "/dependencies", icon: <PackageIcon /> },
                { name: t("builds.title"), path: "/builds", icon: <HammerIcon /> },
                { name: t("deployments.title"), path: "/deployments", icon: <RocketIcon /> },
                { name: t("integration.sidebar_title"), path: "/integration", icon: <LinkIcon /> }
            ]
        },
        {
            title: t("navigation.sections.services"),
            items: [{ name: t("services.title"), path: "/services", icon: <Server /> }]
        }
    ]

    return (
        <div className="w-screen h-screen overflow-y-auto max-w-screen-2xl mx-auto md:flex md:flex-row md:gap-2 md:overflow-hidden">
            <Sidebar isCollapsed={isSidebarCollapsed} mainNavSections={mainNavSections} toggleCollapsed={toggleSidebar} />

            {/* Main content */}
            <div id="main_content" className="py-2 px-1 mt-2 flex-1 flex flex-col gap-2 transition-all duration-300 md:h-full md:overflow-y-auto md:mt-0">
                {/* Header */}
                <Header />
                {/* Page Content: la chat dell'agente scorre al suo interno, con la casella di testo sempre in vista. */}
                <main className={cn("flex-grow p-3 pb-0", isAssistantPage && "min-h-0")}>{children}</main>
            </div>

            {!isAssistantPage && <AssistantPanel />}
        </div>
    )
}

export default MainLayout
