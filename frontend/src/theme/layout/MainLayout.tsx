import { Sidebar } from "@/components/ui/Sidebar/Sidebar"
import { FileText, LayoutDashboard, Link as LinkIcon, Rocket as RocketIcon, Settings } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import Header from "./Header"

interface MainLayoutProps {
    children: React.ReactNode
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
    const { t } = useTranslation()
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)

    const toggleSidebar = () => {
        setIsSidebarCollapsed(!isSidebarCollapsed)
    }

    const mainNavItems = [
        {
            name: "Microfrontends",
            path: "/microfrontends",
            icon: <LayoutDashboard />
        },
        {
            name: t("environmentVariables.title"),
            path: "/environment-variables",
            icon: <FileText />
        },
        {
            name: t("deployments.title"),
            path: "/deployments",
            icon: <RocketIcon />
        },
        {
            name: t("integration.sidebar_title"),
            path: "/integration",
            icon: <LinkIcon />
        },
        {
            name: t("settings.title"),
            path: "/settings",
            icon: <Settings />
        }
    ]

    return (
        <div className="w-screen h-screen overflow-y-auto max-w-screen-2xl mx-auto md:flex md:flex-row md:gap-2 md:overflow-hidden">
            <Sidebar isCollapsed={isSidebarCollapsed} mainNavItems={mainNavItems} toggleCollapsed={toggleSidebar} />

            {/* Main content */}
            <div id="main_content" className="py-2 px-1 mt-2 flex-1 flex flex-col gap-2 transition-all duration-300 md:h-full md:overflow-y-auto md:mt-0">
                {/* Header */}
                <Header />
                {/* Page Content */}
                <main className="flex-grow p-3 pb-0">{children}</main>
            </div>
        </div>
    )
}

export default MainLayout
