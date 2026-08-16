import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tooltip, TooltipContent, TooltipTrigger } from "@mfe-orchestrator/design-system"
import { Cloud, Cog, Hammer, Link as LinkIcon, LucideIcon, Server } from "lucide-react"
import React, { useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { Badge, Button } from "@/components/atoms"
import { CanaryType, HostedOn, Microfrontend } from "@/hooks/apiClients/useMicrofrontendsApi"
import { BuildDialog, CloneRepositoryPopover } from "@/pages/microfrontends/partials/components"
import { HOST_TYPE_LABEL_KEYS } from "../labels"

interface MicrofrontendsTableProps {
    microfrontends: Microfrontend[]
}

const COLUMN_COUNT = 7

/** The host is a single value out of three, so it reads as an icon and spells itself out on hover. */
const HOST_TYPE_ICONS: Record<HostedOn, LucideIcon> = {
    [HostedOn.MFE_ORCHESTRATOR_HUB]: Cloud,
    [HostedOn.CUSTOM_URL]: LinkIcon,
    [HostedOn.CUSTOM_SOURCE]: Server
}

const HostCell: React.FC<{ host: Microfrontend["host"] }> = ({ host }) => {
    const { t } = useTranslation("platform")

    const Icon = HOST_TYPE_ICONS[host.type]
    const label = t(HOST_TYPE_LABEL_KEYS[host.type])

    return (
        <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
                <span className="inline-flex text-foreground-secondary" aria-label={label}>
                    <Icon className="size-4" />
                </span>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
        </Tooltip>
    )
}

/**
 * The canary column. On User enrols an explicit list of users instead of splitting traffic, so it gets
 * a badge: a share bar sitting at 0% would read as "nobody sees the canary".
 */
const CanaryCell: React.FC<{ canary: Microfrontend["canary"] }> = ({ canary }) => {
    const { t } = useTranslation("platform")

    if (!canary?.enabled) {
        return <span className="whitespace-nowrap italic text-foreground-secondary">{t("microfrontend.canary_none")}</span>
    }

    if (canary.type === CanaryType.ON_USER) {
        return <Badge variant="outline">{t("microfrontend.canary_enrolled_users")}</Badge>
    }

    const percentage = Math.min(100, Math.max(0, canary.percentage ?? 0))
    if (percentage <= 0) {
        return <span className="whitespace-nowrap italic text-foreground-secondary">{t("microfrontend.canary_none")}</span>
    }

    return (
        <div className="flex min-w-[7rem] items-center gap-2">
            <div className="h-1.5 w-full max-w-20 overflow-hidden rounded-full bg-primary/20">
                <div className="h-full rounded-full bg-primary" style={{ width: `${percentage}%` }} />
            </div>
            <span className="whitespace-nowrap text-xs tabular-nums text-foreground-secondary">
                {percentage}% {t("microfrontend.ofUsers")}
            </span>
        </div>
    )
}

/** A canary deployed by URL carries no version of its own, so the cell stays empty rather than lying. */
const CanaryVersionCell: React.FC<{ canary: Microfrontend["canary"] }> = ({ canary }) => {
    if (!canary?.enabled || !canary.version) {
        return <span className="text-foreground-secondary">—</span>
    }

    return <Badge variant="outline">{canary.version}</Badge>
}

const MicrofrontendRow: React.FC<{ mfe: Microfrontend }> = ({ mfe }) => {
    const { t } = useTranslation("platform")
    const navigate = useNavigate()

    const [isBuildDialogOpen, setIsBuildDialogOpen] = useState(false)
    const hasRepository = Boolean(mfe.codeRepository?.enabled)

    return (
        <TableRow className="border-divider hover:bg-primary/5">
            {/* Capped so a long name or slug cannot push the action column out of view. */}
            <TableCell className="max-w-[16rem] truncate font-medium" title={mfe.name}>
                {mfe.name}
            </TableCell>
            <TableCell className="max-w-[14rem] truncate text-foreground-secondary" title={mfe.slug}>
                {mfe.slug}
            </TableCell>
            <TableCell>
                <Badge>{mfe.version}</Badge>
            </TableCell>
            <TableCell>
                <HostCell host={mfe.host} />
            </TableCell>
            <TableCell>
                <CanaryCell canary={mfe.canary} />
            </TableCell>
            <TableCell className="whitespace-nowrap">
                <CanaryVersionCell canary={mfe.canary} />
            </TableCell>
            <TableCell className="whitespace-nowrap text-right">
                <div className="flex justify-end gap-2">
                    <CloneRepositoryPopover microfrontend={mfe} />
                    {hasRepository && (
                        <Button variant="secondary" size="sm" onClick={() => setIsBuildDialogOpen(true)}>
                            <Hammer />
                            {t("microfrontend.card.build")}
                        </Button>
                    )}
                    <Button variant="secondary" size="sm" onClick={() => navigate(`/microfrontend/${mfe._id}`)}>
                        <Cog />
                        {t("common.configuration")}
                    </Button>
                </div>
                <BuildDialog open={isBuildDialogOpen} onOpenChange={setIsBuildDialogOpen} microfrontendId={mfe._id} microfrontendName={mfe.name} />
            </TableCell>
        </TableRow>
    )
}

export const MicrofrontendsTable: React.FC<MicrofrontendsTableProps> = ({ microfrontends }) => {
    const { t } = useTranslation("platform")

    return (
        <div className="overflow-hidden rounded-lg border-2 border-border bg-card">
            <Table>
                <TableHeader>
                    <TableRow className="bg-muted/60 hover:bg-muted/60">
                        <TableHead>{t("common.name")}</TableHead>
                        <TableHead>{t("microfrontend.slug")}</TableHead>
                        <TableHead>{t("microfrontend.version")}</TableHead>
                        <TableHead>{t("microfrontend.host")}</TableHead>
                        <TableHead>{t("microfrontend.canary_release")}</TableHead>
                        <TableHead>{t("microfrontend.canary_version")}</TableHead>
                        <TableHead className="text-right">{t("common.actions")}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {microfrontends.length > 0 ? (
                        microfrontends.map(mfe => <MicrofrontendRow key={mfe._id} mfe={mfe} />)
                    ) : (
                        <TableRow>
                            <TableCell colSpan={COLUMN_COUNT} className="h-24 text-center">
                                <span className="text-foreground-secondary">{t("microfrontend.no_microfrontends_found")}</span>
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
    )
}

export default MicrofrontendsTable
