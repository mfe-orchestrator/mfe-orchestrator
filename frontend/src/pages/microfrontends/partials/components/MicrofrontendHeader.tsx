import { ArrowLeft, GitBranch, Info, Sparkles } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Link, NavLink } from "react-router-dom"
import { Badge } from "@/components/atoms"
import PageHead from "@/components/PageHead"
import type { Microfrontend } from "@/hooks/apiClients/useMicrofrontendsApi"
import { cn } from "@/utils/styleUtils"

/** Edit with AI needs both an AI provider on the installation and a repository the agent can work on. */
export const isAiEditAvailable = (microfrontend: Microfrontend | undefined, assistantEnabled: boolean) => assistantEnabled && Boolean(microfrontend?.codeRepository?.enabled)

interface MicrofrontendHeaderProps {
    microfrontend: Microfrontend
    /** The two screens of a microfrontend: the AI workspace and its details. */
    active: "ai" | "settings"
    aiAvailable: boolean
}

const navLinkClassName = ({ isActive }: { isActive: boolean }) =>
    cn(
        "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isActive ? "bg-background text-foreground shadow-sm" : "text-foreground-secondary hover:text-foreground"
    )

/** Shared by the two screens of a microfrontend, so switching between them keeps the same frame. */
export const MicrofrontendHeader: React.FC<MicrofrontendHeaderProps> = ({ microfrontend, active, aiAvailable }) => {
    const { t } = useTranslation()
    const pageTitle = active === "ai" ? t("microfrontend.workspace.nav_ai") : t("microfrontend.workspace.nav_settings")

    return (
        <header className="flex flex-col gap-4">
            <PageHead title={`${microfrontend.name} · ${pageTitle}`} />
            <Link to="/microfrontends" className="inline-flex w-fit items-center gap-1 text-sm text-foreground-secondary underline-offset-4 hover:text-foreground hover:underline">
                <ArrowLeft className="size-4" aria-hidden="true" />
                {t("microfrontend.workspace.back")}
            </Link>
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="min-w-0">
                    <h1 className="break-words text-2xl font-bold text-foreground">{microfrontend.name}</h1>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-foreground-secondary">
                        <span className="font-mono">{microfrontend.slug}</span>
                        <Badge variant="outline">{t("microfrontend.workspace.version", { version: microfrontend.version })}</Badge>
                        {microfrontend.codeRepository?.enabled && microfrontend.codeRepository.name && (
                            <span className="inline-flex items-center gap-1">
                                <GitBranch className="size-3.5" aria-hidden="true" />
                                {microfrontend.codeRepository.name}
                            </span>
                        )}
                    </div>
                </div>
                {aiAvailable && (
                    <nav aria-label={t("microfrontend.workspace.nav_label")} className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
                        <NavLink to={`/microfrontend/${microfrontend._id}`} end className={navLinkClassName}>
                            <Sparkles className="size-4" aria-hidden="true" />
                            {t("microfrontend.workspace.nav_ai")}
                        </NavLink>
                        <NavLink to={`/microfrontend/${microfrontend._id}/settings`} className={navLinkClassName}>
                            <Info className="size-4" aria-hidden="true" />
                            {t("microfrontend.workspace.nav_settings")}
                        </NavLink>
                    </nav>
                )}
            </div>
        </header>
    )
}

export default MicrofrontendHeader
