import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@mfe-orchestrator/design-system"
import { Cog } from "lucide-react"
import React from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { Badge, Button } from "@/components/atoms"
import { Microfrontend } from "@/hooks/apiClients/useMicrofrontendsApi"
import { CloneRepositoryPopover } from "@/pages/microfrontends/partials/components"
import { HOST_TYPE_LABEL_KEYS } from "../labels"

interface MicrofrontendsTableProps {
    microfrontends: Microfrontend[]
}

const COLUMN_COUNT = 6

export const MicrofrontendsTable: React.FC<MicrofrontendsTableProps> = ({ microfrontends }) => {
    const { t } = useTranslation("platform")
    const navigate = useNavigate()

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
                        <TableHead className="text-right">{t("common.actions")}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {microfrontends.length > 0 ? (
                        microfrontends.map(mfe => {
                            const canaryPercentage = mfe.canary?.enabled ? Math.min(100, Math.max(0, mfe.canary.percentage ?? 0)) : 0

                            return (
                                <TableRow key={mfe._id} className="border-divider hover:bg-primary/5">
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
                                    <TableCell className="whitespace-nowrap text-foreground-secondary">{t(HOST_TYPE_LABEL_KEYS[mfe.host.type])}</TableCell>
                                    <TableCell>
                                        {canaryPercentage > 0 ? (
                                            <div className="flex min-w-[7rem] items-center gap-2">
                                                <div className="h-1.5 w-full max-w-20 overflow-hidden rounded-full bg-primary/20">
                                                    <div className="h-full rounded-full bg-primary" style={{ width: `${canaryPercentage}%` }} />
                                                </div>
                                                <span className="whitespace-nowrap text-xs tabular-nums text-foreground-secondary">
                                                    {canaryPercentage}% {t("microfrontend.ofUsers")}
                                                </span>
                                            </div>
                                        ) : (
                                            <span className="italic text-foreground-secondary">{t("common.no_data")}</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap text-right">
                                        <div className="flex justify-end gap-2">
                                            <CloneRepositoryPopover microfrontend={mfe} />
                                            <Button variant="secondary" size="sm" onClick={() => navigate(`/microfrontend/${mfe._id}`)}>
                                                <Cog />
                                                {t("common.configuration")}
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )
                        })
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
