import { Info, Settings, Sparkles } from "lucide-react"
import { useTranslation } from "react-i18next"
import WorkspaceHeader from "@/components/ai-workspace/WorkspaceHeader"
import useProjectAiModels from "@/components/assistant/useProjectAiModels"
import { Badge } from "@/components/atoms"
import RepositoryLink from "@/components/RepositoryLink"
import TemplateRepositoryLink from "@/components/TemplateRepositoryLink"
import type { Service } from "@/hooks/apiClients/useServicesApi"
import RuntimeBadge from "./RuntimeBadge"

interface ServiceHeaderProps {
    service: Service
    /** The screens of a service: its overview, Edit with AI (when available) and its settings. */
    active: "overview" | "ai" | "settings"
    actions?: React.ReactNode
}

/** Edit with AI needs both an AI provider on the installation and a repository the agent can work on. */
export const isServiceAiAvailable = (service: Service | undefined, assistantEnabled: boolean) => assistantEnabled && Boolean(service?.codeRepository?.enabled)

const PAGE_TITLE_KEY: Record<ServiceHeaderProps["active"], string> = { overview: "services.nav_overview", ai: "services.nav_ai", settings: "services.nav_settings" }

export const ServiceHeader: React.FC<ServiceHeaderProps> = ({ service, active, actions }) => {
    const { t } = useTranslation()
    const aiAvailable = isServiceAiAvailable(service, useProjectAiModels().enabled)

    return (
        <WorkspaceHeader
            back={{ to: "/services", label: t("services.back") }}
            title={service.name}
            pageTitle={t(PAGE_TITLE_KEY[active])}
            meta={
                <>
                    <span className="font-mono">{service.slug}</span>
                    <RuntimeBadge service={service} />
                    {service.version && <Badge variant="outline">{t("services.version_short", { version: service.version })}</Badge>}
                    <RepositoryLink repository={service.codeRepository} />
                    <TemplateRepositoryLink slug={service.template} />
                </>
            }
            navLabel={t("services.nav_label")}
            tabs={[
                ...(aiAvailable ? [{ to: `/service/${service._id}`, label: t("services.nav_ai"), icon: Sparkles, end: true }] : []),
                { to: `/service/${service._id}/overview`, label: t("services.nav_overview"), icon: Info },
                { to: `/service/${service._id}/settings`, label: t("services.nav_settings"), icon: Settings }
            ]}
            actions={actions}
        />
    )
}

export default ServiceHeader
