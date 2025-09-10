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
            name: t("integration.title"),
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
        <div className="h-screen w-screen flex gap-2 p-2 overflow-hidden max-w-screen-2xl mx-auto">
            <Sidebar isCollapsed={isSidebarCollapsed} mainNavItems={mainNavItems} toggleCollapsed={toggleSidebar} />

            {/* Main content */}
            <div className="flex-1 h-[calc(100vh-1rem)] overflow-y-auto flex flex-col gap-2 transition-all duration-300">
                {/* Header */}
                <Header />
                {/* Page Content */}
                <main className="flex-grow p-3 pb-0">{children}</main>
            </div>
        </div>
    )
}

export default MainLayout
