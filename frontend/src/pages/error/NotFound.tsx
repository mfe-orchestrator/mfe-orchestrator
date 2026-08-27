import { EmptyState } from "@mfe-orchestrator/design-system"
import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { useLocation } from "react-router-dom"
import { Button } from "@/components/atoms"
import PageHead from "@/components/PageHead"

export const NotFound = () => {
    const { t } = useTranslation()
    const location = useLocation()

    useEffect(() => {
        console.error("404 Error: User attempted to access non-existent route:", location.pathname)
    }, [location.pathname])

    return (
        <div className="min-h-screen flex flex-col items-center justify-center">
            <PageHead title={t("app.error.not_found")} />
            {/* Fuori dall'EmptyState: lo slot `icon` è aria-hidden e i `children` finiscono sotto le azioni, qui invece il numero resta l'h1 della pagina */}
            <h1 className="text-4xl font-bold">404</h1>
            <EmptyState
                size="lg"
                titleAs="h2"
                title={t("app.error.not_found_title")}
                description={t("app.error.not_found_description")}
                actions={<Button href="/">{t("app.error.back_home")}</Button>}
            />
        </div>
    )
}

export default NotFound
