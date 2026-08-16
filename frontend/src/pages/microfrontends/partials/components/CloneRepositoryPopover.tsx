import { CopyButton, Popover, PopoverContent, PopoverTrigger } from "@mfe-orchestrator/design-system"
import { Code, GitBranch, Terminal } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms"
import { Microfrontend } from "@/hooks/apiClients/useMicrofrontendsApi"
import { buildGitCloneCommand, buildIntelliJCloneUrl, buildVsCodeCloneUrl } from "@/utils/repositoryCloneUrls"

interface CloneRepositoryPopoverProps {
    microfrontend: Microfrontend
    className?: string
    /** Renders the trigger as a compact icon-only button, for tight spots like the flow nodes. */
    iconOnly?: boolean
}

interface CloneUrlRowProps {
    label: string
    url: string
}

const CloneUrlRow: React.FC<CloneUrlRowProps> = ({ label, url }) => (
    <div className="flex flex-col gap-1">
        {/* Negli appunti finisce il comando completo, mentre il bottone mostra solo l'url */}
        <CopyButton value={buildGitCloneCommand(url)} label={label} copiedLabel={label} showLabel variant="secondary" size="sm" className="w-full justify-start" title={url} />
        <p className="truncate font-mono text-xs text-foreground-secondary" title={url}>
            {url}
        </p>
    </div>
)

interface IdeCloneButtonProps {
    label: string
    href: string
    icon: React.ReactNode
    variant: "primary" | "secondary"
}

const IdeCloneButton: React.FC<IdeCloneButtonProps> = ({ label, href, icon, variant }) => (
    <Button asChild variant={variant} size="sm" className="w-full justify-start">
        {/* Protocol handler link, so it cannot go through the router-aware `href` prop of Button. */}
        <a href={href}>
            {icon}
            <span className="truncate">{label}</span>
        </a>
    </Button>
)

export const CloneRepositoryPopover: React.FC<CloneRepositoryPopoverProps> = ({ microfrontend, className, iconOnly = false }) => {
    const { t } = useTranslation("platform")

    const httpsUrl = microfrontend.codeRepository?.cloneUrlHttps
    const sshUrl = microfrontend.codeRepository?.cloneUrlSsh
    const ideUrl = httpsUrl || sshUrl

    if (!microfrontend.codeRepository?.enabled || (!httpsUrl && !sshUrl)) {
        return null
    }

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    variant="secondary"
                    size={iconOnly ? "icon-sm" : "sm"}
                    className={className}
                    title={iconOnly ? t("microfrontend.clone.button") : undefined}
                    aria-label={t("microfrontend.clone.button")}
                >
                    <GitBranch />
                    {!iconOnly && t("microfrontend.clone.button")}
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="flex w-80 flex-col gap-3">
                <div>
                    <p className="font-semibold">{t("microfrontend.clone.title")}</p>
                    <p className="text-sm text-foreground-secondary">{t("microfrontend.clone.description")}</p>
                </div>

                {httpsUrl && <CloneUrlRow label={t("microfrontend.clone.https")} url={httpsUrl} />}
                {sshUrl && <CloneUrlRow label={t("microfrontend.clone.ssh")} url={sshUrl} />}

                {ideUrl && (
                    <>
                        <IdeCloneButton label={t("microfrontend.clone.vscode")} href={buildVsCodeCloneUrl(ideUrl)} icon={<Terminal />} variant="primary" />
                        <IdeCloneButton label={t("microfrontend.clone.intellij")} href={buildIntelliJCloneUrl(ideUrl)} icon={<Code />} variant="secondary" />
                    </>
                )}
            </PopoverContent>
        </Popover>
    )
}

export default CloneRepositoryPopover
