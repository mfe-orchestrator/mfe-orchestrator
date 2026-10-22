import { Info, Sparkles } from "lucide-react"
import { useTranslation } from "react-i18next"
import WorkspaceHeader from "@/components/ai-workspace/WorkspaceHeader"
import { Badge } from "@/components/atoms"
import RepositoryLink from "@/components/RepositoryLink"
import TemplateRepositoryLink from "@/components/TemplateRepositoryLink"
import type { Microfrontend } from "@/hooks/apiClients/useMicrofrontendsApi"

/** Edit with AI needs both an AI provider on the installation and a repository the agent can work on. */
export const isAiEditAvailable = (microfrontend: Microfrontend | undefined, assistantEnabled: boolean) => assistantEnabled && Boolean(microfrontend?.codeRepository?.enabled)

interface MicrofrontendHeaderProps {
    microfrontend: Microfrontend
    /** The two screens of a microfrontend: the AI workspace and its details. */
    active: "ai" | "settings"
    aiAvailable: boolean
}

/** Shared by the two screens of a microfrontend, so switching between them keeps the same frame. */
export const MicrofrontendHeader: React.FC<MicrofrontendHeaderProps> = ({ microfrontend, active, aiAvailable }) => {
    const { t } = useTranslation()

    return (
        <WorkspaceHeader
            back={{ to: "/microfrontends", label: t("microfrontend.workspace.back") }}
            title={microfrontend.name}
            pageTitle={active === "ai" ? t("microfrontend.workspace.nav_ai") : t("microfrontend.workspace.nav_settings")}
            meta={
                <>
                    <span className="font-mono">{microfrontend.slug}</span>
                    <Badge variant="outline">{t("microfrontend.workspace.version", { version: microfrontend.version || "—" })}</Badge>
                    <RepositoryLink repository={microfrontend.codeRepository} />
                    <TemplateRepositoryLink slug={microfrontend.template} />
                </>
            }
            navLabel={t("microfrontend.workspace.nav_label")}
            tabs={
                aiAvailable
                    ? [
                          { to: `/microfrontend/${microfrontend._id}`, label: t("microfrontend.workspace.nav_ai"), icon: Sparkles, end: true },
                          { to: `/microfrontend/${microfrontend._id}/settings`, label: t("microfrontend.workspace.nav_settings"), icon: Info }
                      ]
                    : []
            }
        />
    )
}

export default MicrofrontendHeader
