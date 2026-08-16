import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { useLocation } from "react-router-dom"
import PageHead from "@/components/PageHead"

export const NotFound = () => {
    const { t } = useTranslation()
    const location = useLocation()

    useEffect(() => {
        console.error("404 Error: User attempted to access non-existent route:", location.pathname)
    }, [location.pathname])

    return (
        <div className="min-h-screen flex items-center justify-center">
            <PageHead title={t("app.error.not_found")} />
            <div className="text-center">
                <h1 className="text-4xl font-bold mb-4">404</h1>
                <p className="text-xl text-muted-foreground mb-4">Oops! Page not found</p>
                <a href="/" className="text-primary hover:text-primary/80 underline">
                    Return to Home
                </a>
            </div>
        </div>
    )
}

export default NotFound
