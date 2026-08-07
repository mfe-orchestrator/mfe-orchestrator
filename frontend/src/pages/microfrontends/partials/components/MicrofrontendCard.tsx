import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@mfe-orchestrator/design-system"
import { Cog, GitBranch, Globe, Hammer, UsersRound } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { Badge, Button } from "@/components/atoms"
import { Microfrontend } from "@/hooks/apiClients/useMicrofrontendsApi"
import { CANARY_DEPLOYMENT_TYPE_LABEL_KEYS, CANARY_TYPE_LABEL_KEYS, HOST_TYPE_LABEL_KEYS } from "../labels"
import BuildDialog from "./BuildDialog"
import CloneRepositoryPopover from "./CloneRepositoryPopover"

interface MicrofrontendCardProps {
    mfe: Microfrontend
}

export const MicrofrontendCard: React.FC<MicrofrontendCardProps> = ({ mfe }) => {
    const { t } = useTranslation("platform")
    const navigate = useNavigate()

    const [isBuildDialogOpen, setIsBuildDialogOpen] = useState(false)

    const canary = mfe.canary?.enabled ? mfe.canary : undefined
    const canaryPercentage = Math.min(100, Math.max(0, canary?.percentage ?? 0))
    const hasRepository = Boolean(mfe.codeRepository?.enabled)

    return (
        <Card className="flex h-full flex-col transition-colors duration-200 hover:border-primary">
            <CardHeader className="flex-row items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <CardTitle className="mb-0 truncate" title={mfe.name}>
                        {mfe.name}
                    </CardTitle>
                    <p className="truncate text-sm text-foreground-secondary" title={mfe.slug}>
                        {mfe.slug}
                    </p>
                </div>
                <Badge className="shrink-0">{mfe.version}</Badge>
            </CardHeader>

            <CardContent className="flex flex-grow flex-col gap-3 py-3">
                <dl className="flex flex-col gap-1.5 text-sm">
                    <div className="flex items-center gap-2">
                        <dt className="flex items-center gap-2 text-foreground-secondary">
                            <Globe className="size-4 shrink-0" aria-hidden="true" />
                            <span className="sr-only">{t("microfrontend.host")}</span>
                        </dt>
                        <dd className="min-w-0 truncate">{t(HOST_TYPE_LABEL_KEYS[mfe.host.type])}</dd>
                    </div>
                    {hasRepository && (
                        <div className="flex items-center gap-2">
                            <dt className="flex items-center gap-2 text-foreground-secondary">
                                <GitBranch className="size-4 shrink-0" aria-hidden="true" />
                                <span className="sr-only">{t("microfrontend.card.repository")}</span>
                            </dt>
                            <dd className="min-w-0 truncate" title={mfe.codeRepository?.name}>
                                {mfe.codeRepository?.name || t("microfrontend.card.repository")}
                            </dd>
                        </div>
                    )}
                </dl>

                {canary && (
                    <div className="rounded-md border border-divider bg-primary/5 p-3">
                        <div className="flex items-center justify-between gap-2">
                            <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-primary">
                                <UsersRound className="size-4 shrink-0" aria-hidden="true" />
                                <span className="truncate">{t("microfrontend.card.canary")}</span>
                            </span>
                            <span className="shrink-0 text-sm font-semibold tabular-nums">{canaryPercentage}%</span>
                        </div>
                        <div
                            className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-primary/20"
                            role="progressbar"
                            aria-valuenow={canaryPercentage}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={t("microfrontend.canaryReleaseActive")}
                        >
                            <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${canaryPercentage}%` }} />
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            {canary.type && <Badge variant="outline">{t(CANARY_TYPE_LABEL_KEYS[canary.type])}</Badge>}
                            {canary.deploymentType && <Badge variant="outline">{t(CANARY_DEPLOYMENT_TYPE_LABEL_KEYS[canary.deploymentType])}</Badge>}
                        </div>
                        {canary.version && (
                            <p className="mt-2 truncate text-xs text-foreground-secondary">
                                {t("microfrontend.canaryVersion")}: {canary.version}
                            </p>
                        )}
                        {canary.url && (
                            <p className="mt-1 truncate text-xs text-foreground-secondary" title={canary.url}>
                                {canary.url}
                            </p>
                        )}
                    </div>
                )}
            </CardContent>

            <CardFooter className="flex-wrap gap-2 border-t border-divider pt-3">
                <Button variant="primary" size="sm" onClick={() => navigate(`/microfrontend/${mfe._id}`)} className="flex-1">
                    <Cog />
                    {t("common.configuration")}
                </Button>
                {hasRepository && (
                    <Button variant="secondary" size="sm" onClick={() => setIsBuildDialogOpen(true)} className="flex-1">
                        <Hammer />
                        {t("microfrontend.card.build")}
                    </Button>
                )}
                <CloneRepositoryPopover microfrontend={mfe} className="flex-1" />
            </CardFooter>

            <BuildDialog open={isBuildDialogOpen} onOpenChange={setIsBuildDialogOpen} microfrontendId={mfe._id} microfrontendName={mfe.name} />
        </Card>
    )
}

export default MicrofrontendCard
