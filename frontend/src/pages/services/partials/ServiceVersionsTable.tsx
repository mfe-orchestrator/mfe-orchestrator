import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyStateRow, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@mfe-orchestrator/design-system"
import { Copy } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Badge, Button } from "@/components/atoms"
import type { BuiltService } from "@/hooks/apiClients/useServicesApi"
import useToastNotificationStore from "@/store/useToastNotificationStore"

/** "sha256:0123456789ab…" is enough to tell two builds apart. */
const shortDigest = (digest?: string) => (digest ? digest.replace(/^sha256:/, "").slice(0, 12) : undefined)

export const ServiceVersionsTable: React.FC<{ versions: BuiltService[] }> = ({ versions }) => {
    const { t } = useTranslation()
    const notifications = useToastNotificationStore()

    const copyImage = async (image: string) => {
        try {
            await navigator.clipboard.writeText(image)
            notifications.showSuccessNotification({ message: t("services.versions.copied") })
        } catch {
            notifications.showErrorNotification({ message: t("services.versions.copy_failed") })
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="mb-0">{t("services.versions.title")}</CardTitle>
                <CardDescription>{t("services.versions.description")}</CardDescription>
            </CardHeader>
            <CardContent className="pt-3">
                <div className="overflow-hidden rounded-lg border-2 border-border bg-card">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/60 hover:bg-muted/60">
                                <TableHead>{t("services.versions.version")}</TableHead>
                                <TableHead>{t("services.versions.image")}</TableHead>
                                <TableHead>{t("services.versions.digest")}</TableHead>
                                <TableHead>{t("services.versions.date")}</TableHead>
                                <TableHead className="text-right">{t("common.actions")}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {versions.length > 0 ? (
                                versions.map(built => (
                                    <TableRow key={built._id ?? built.version} className="border-divider hover:bg-primary/5">
                                        <TableCell>
                                            <Badge>{built.version}</Badge>
                                        </TableCell>
                                        <TableCell className="max-w-[24rem] truncate font-mono text-xs" title={built.image}>
                                            {built.image}
                                        </TableCell>
                                        <TableCell className="font-mono text-xs text-foreground-secondary" title={built.digest}>
                                            {shortDigest(built.digest) ?? "—"}
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap text-foreground-secondary">{built.createdAt ? new Date(built.createdAt).toLocaleString() : "—"}</TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                onClick={() => copyImage(built.image)}
                                                aria-label={t("services.versions.copy_image")}
                                                title={t("services.versions.copy_image")}
                                            >
                                                <Copy />
                                                {t("common.copy")}
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <EmptyStateRow colSpan={5}>{t("services.versions.empty")}</EmptyStateRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    )
}

export default ServiceVersionsTable
