import React from "react"
import { useTranslation } from "react-i18next"
import { twMerge } from "tailwind-merge"

interface MainLogoProps {
    /**
     * Additional CSS classes to apply to the logo
     */
    className?: string
    /**
     * Size of the logo
     * @default 'md'
     */
    size?: "sm" | "md" | "lg"
}

const sizeClasses = {
    sm: "h-8 w-8",
    md: "h-12 w-12",
    lg: "h-16 w-16"
}

/**
 * MainLogo component that displays the official MFE Orchestrator logo
 */
export const MainLogo: React.FC<MainLogoProps> = ({ className = "", size = "md" }) => {
    const { t } = useTranslation()

    return <img src="/img/logo.png" alt={t("app.name")} className={twMerge(sizeClasses[size], className)} data-testid="main-logo" />
}

export default MainLogo
