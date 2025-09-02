import { Sidebar } from "@/components/ui/Sidebar/Sidebar"
import { FileText, Github, Languages, LayoutDashboard, Link as LinkIcon, Rocket as RocketIcon, Settings, Sun } from "lucide-react"
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
            name: t("sftp.title"),
            path: "/sftp",
            disabled: true,
            icon: <FileText />
        },
        {
            name: t("settings.title"),
            path: "/settings",
            icon: <Settings />
        }
    ]

    return (
        <div className="min-h-screen flex">
            <Sidebar isCollapsed={isSidebarCollapsed} mainNavItems={mainNavItems} toggleCollapsed={toggleSidebar} />

            {/* Main content */}
            <div className={`flex-1 transition-all duration-300 ${!isSidebarCollapsed ? "ml-[17rem]" : "ml-[6rem]"}`}>
                {/* Header */}
                <Header />
                {/* Page Content */}
                <main className="p-6">{children}</main>
            </div>
        </div>
    )
}

export default MainLayout
