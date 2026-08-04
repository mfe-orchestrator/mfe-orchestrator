import { Check, Copy, GitBranch, Terminal } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Microfrontend } from "@/hooks/apiClients/useMicrofrontendsApi"
import { buildGitCloneCommand, buildVsCodeCloneUrl } from "@/utils/repositoryCloneUrls"

interface CloneRepositoryPopoverProps {
    microfrontend: Microfrontend
    className?: string
}

type CopiedTarget = "https" | "ssh" | null

interface CloneUrlRowProps {
    label: string
    url: string
    copied: boolean
    onCopy: () => void
}

const CloneUrlRow: React.FC<CloneUrlRowProps> = ({ label, url, copied, onCopy }) => (
    <div className="flex flex-col gap-1">
        <Button variant="secondary" size="sm" className="w-full justify-start" onClick={onCopy} title={url}>
            {copied ? <Check className="text-green-500" /> : <Copy />}
            <span className="truncate">{label}</span>
        </Button>
        <p className="truncate font-mono text-xs text-foreground-secondary" title={url}>
            {url}
        </p>
    </div>
)

export const CloneRepositoryPopover: React.FC<CloneRepositoryPopoverProps> = ({ microfrontend, className }) => {
    const { t } = useTranslation("platform")
    const [copied, setCopied] = useState<CopiedTarget>(null)
    const resetCopiedTimeout = useRef<ReturnType<typeof setTimeout>>()

    // The timeout would otherwise call setState on an unmounted popover.
    useEffect(() => () => clearTimeout(resetCopiedTimeout.current), [])

    const httpsUrl = microfrontend.codeRepository?.cloneUrlHttps
    const sshUrl = microfrontend.codeRepository?.cloneUrlSsh
    const vsCodeUrl = httpsUrl || sshUrl

    if (!microfrontend.codeRepository?.enabled || (!httpsUrl && !sshUrl)) {
        return null
    }

    const copyCloneCommand = (target: Exclude<CopiedTarget, null>, url: string) => {
        navigator.clipboard.writeText(buildGitCloneCommand(url))
        setCopied(target)
        clearTimeout(resetCopiedTimeout.current)
        resetCopiedTimeout.current = setTimeout(() => setCopied(null), 2000)
    }

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="secondary" size="sm" className={className}>
                    <GitBranch />
                    {t("microfrontend.clone.button")}
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="flex w-80 flex-col gap-3">
                <div>
                    <p className="font-semibold">{t("microfrontend.clone.title")}</p>
                    <p className="text-sm text-foreground-secondary">{t("microfrontend.clone.description")}</p>
                </div>

                {httpsUrl && <CloneUrlRow label={t("microfrontend.clone.https")} url={httpsUrl} copied={copied === "https"} onCopy={() => copyCloneCommand("https", httpsUrl)} />}
                {sshUrl && <CloneUrlRow label={t("microfrontend.clone.ssh")} url={sshUrl} copied={copied === "ssh"} onCopy={() => copyCloneCommand("ssh", sshUrl)} />}

                {vsCodeUrl && (
                    <Button asChild variant="primary" size="sm" className="w-full justify-start">
                        {/* Protocol handler link, so it cannot go through the router-aware `href` prop of Button. */}
                        <a href={buildVsCodeCloneUrl(vsCodeUrl)}>
                            <Terminal />
                            <span className="truncate">{t("microfrontend.clone.vscode")}</span>
                        </a>
                    </Button>
                )}
            </PopoverContent>
        </Popover>
    )
}

export default CloneRepositoryPopover
