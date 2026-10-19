import { ArrowLeft, Info, Settings, Sparkles } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Link, NavLink } from "react-router-dom"
import useAssistantEnabled from "@/components/assistant/useAssistantEnabled"
import { Badge } from "@/components/atoms"
import PageHead from "@/components/PageHead"
import TemplateRepositoryLink from "@/components/TemplateRepositoryLink"
import type { Service } from "@/hooks/apiClients/useServicesApi"
import { cn } from "@/utils/styleUtils"
import RuntimeBadge from "./RuntimeBadge"

interface ServiceHeaderProps {
    service: Service
    /** The screens of a service: its overview, Edit with AI (when available) and its settings. */
    active: "overview" | "ai" | "settings"
    actions?: React.ReactNode
}

/** Edit with AI needs both an AI provider on the installation and a repository the agent can work on. */
export const isServiceAiAvailable = (service: Service | undefined, assistantEnabled: boolean) => assistantEnabled && Boolean(service?.codeRepository?.enabled)

const navLinkClassName = ({ isActive }: { isActive: boolean }) =>
    cn(
        "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isActive ? "bg-background text-foreground shadow-sm" : "text-foreground-secondary hover:text-foreground"
    )

const PAGE_TITLE_KEY: Record<ServiceHeaderProps["active"], string> = { overview: "services.nav_overview", ai: "services.nav_ai", settings: "services.nav_settings" }

export const ServiceHeader: React.FC<ServiceHeaderProps> = ({ service, active, actions }) => {
    const { t } = useTranslation()
    const aiAvailable = isServiceAiAvailable(service, useAssistantEnabled())
    const pageTitle = t(PAGE_TITLE_KEY[active])

    return (
        <header className="flex flex-col gap-4">
            <PageHead title={`${service.name} · ${pageTitle}`} />
            <Link to="/services" className="inline-flex w-fit items-center gap-1 text-sm text-foreground-secondary underline-offset-4 hover:text-foreground hover:underline">
                <ArrowLeft className="size-4" aria-hidden="true" />
                {t("services.back")}
            </Link>
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="min-w-0">
                    <h1 className="break-words text-2xl font-bold text-foreground">{service.name}</h1>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-foreground-secondary">
                        <span className="font-mono">{service.slug}</span>
                        <RuntimeBadge service={service} />
                        {service.version && <Badge variant="outline">{t("services.version_short", { version: service.version })}</Badge>}
                        <TemplateRepositoryLink slug={service.template} />
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {actions}
                    <nav aria-label={t("services.nav_label")} className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
                        {aiAvailable && (
                            <NavLink to={`/service/${service._id}`} end className={navLinkClassName}>
                                <Sparkles className="size-4" aria-hidden="true" />
                                {t("services.nav_ai")}
                            </NavLink>
                        )}
                        <NavLink to={`/service/${service._id}/overview`} className={navLinkClassName}>
                            <Info className="size-4" aria-hidden="true" />
                            {t("services.nav_overview")}
                        </NavLink>
                        <NavLink to={`/service/${service._id}/settings`} className={navLinkClassName}>
                            <Settings className="size-4" aria-hidden="true" />
                            {t("services.nav_settings")}
                        </NavLink>
                    </nav>
                </div>
            </div>
        </header>
    )
}

export default ServiceHeader
