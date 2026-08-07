import { Card, CardContent, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@mfe-orchestrator/design-system"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Badge, Button } from "@/components/atoms"
import { ApiStatusHandler } from "@/components/organisms"
import SinglePageLayout from "@/components/SinglePageLayout"
import { DeleteConfirmationDialog } from "@/components/ui/DeleteConfirmationDialog"
import useApiKeysApi from "@/hooks/apiClients/useApiKeysApi"
import useProjectStore from "@/store/useProjectStore"
import useThemeStore from "@/store/useThemeStore"
import { CreateApiKeyDialog, NoApiKeyPlaceholder } from "./partials"

export const ApiKeys = () => {
    const { t } = useTranslation()
    const apiKeysApi = useApiKeysApi()
    const queryClient = useQueryClient()
    const project = useProjectStore()
    const themeStore = useThemeStore()

    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
    const [keyToDelete, setKeyToDelete] = useState<{ id: string; name: string } | null>(null)

    const apiKeysQuery = useQuery({
        queryKey: ["api-keys", project.project?._id],
        queryFn: () => apiKeysApi.getApiKeys(project.project?._id || "")
    })

    // Delete API key mutation
    const deleteApiKeyMutation = useMutation({
        mutationFn: apiKeysApi.deleteApiKey,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["api-keys", project.project?._id] })
        }
    })

    const formatExpirationDate = (dateString: string) => {
        if (!dateString) return ""
        return format(new Date(dateString), "PPP", { locale: themeStore.getLocale() })
    }

    const getKeyStatus = (expiresAt: string): { variant: "default" | "accent" | "destructive" | "outline"; label: string; dot: string } => {
        if (!expiresAt) return { variant: "outline", label: t("apiKeys.status_unknown", { defaultValue: "Unknown" }), dot: "bg-muted-foreground" }

        const now = new Date()
        const expirationDate = new Date(expiresAt)
        const daysUntilExpiration = Math.ceil((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

        if (daysUntilExpiration < 0) {
            return { variant: "destructive", label: t("apiKeys.status_expired", { defaultValue: "Expired" }), dot: "bg-destructive" }
        }
        if (daysUntilExpiration <= 30) {
            return { variant: "default", label: t("apiKeys.status_expiring", { defaultValue: "Expiring soon" }), dot: "bg-yellow-500" }
        }
        return { variant: "accent", label: t("apiKeys.status_active", { defaultValue: "Active" }), dot: "bg-green-500" }
    }

    return (
        <>
            <ApiStatusHandler queries={[apiKeysQuery]}>
                <SinglePageLayout
                    title={t("apiKeys.api_keys")}
                    description={t("apiKeys.manage_api_keys")}
                    right={
                        apiKeysQuery.data?.length === 0 ? null : (
                            <Button onClick={() => setIsCreateDialogOpen(true)}>
                                <Plus className="mr-2 h-4 w-4" />
                                {t("apiKeys.create_api_key")}
                            </Button>
                        )
                    }
                >
                    <Card>
                        <CardContent>
                            {apiKeysQuery.data?.length === 0 ? (
                                <NoApiKeyPlaceholder onCreate={() => setIsCreateDialogOpen(true)} />
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>{t("apiKeys.name")}</TableHead>
                                            <TableHead>{t("apiKeys.created")}</TableHead>
                                            <TableHead>{t("apiKeys.expires")}</TableHead>
                                            <TableHead>{t("apiKeys.status", { defaultValue: "Status" })}</TableHead>
                                            <TableHead className="text-right">{t("common.actions")}</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {apiKeysQuery.data?.map(key => {
                                            const keyStatus = getKeyStatus(key.expiresAt)
                                            return (
                                                <TableRow key={key._id}>
                                                    <TableCell className="font-medium">{key.name}</TableCell>
                                                    <TableCell className="text-muted-foreground">{formatExpirationDate(key.createdAt)}</TableCell>
                                                    <TableCell className="text-muted-foreground">{formatExpirationDate(key.expiresAt)}</TableCell>
                                                    <TableCell>
                                                        <Badge variant={keyStatus.variant} className="gap-1.5">
                                                            <span className={`h-1.5 w-1.5 rounded-full ${keyStatus.dot}`} />
                                                            {keyStatus.label}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            disabled={deleteApiKeyMutation.isPending}
                                                            onClick={() => {
                                                                setKeyToDelete({ id: key._id, name: key.name })
                                                                setIsDeleteDialogOpen(true)
                                                            }}
                                                        >
                                                            <Trash2 className="h-4 w-4 text-destructive" />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            )
                                        })}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </SinglePageLayout>
            </ApiStatusHandler>
            <CreateApiKeyDialog isCreateDialogOpen={isCreateDialogOpen} setIsCreateDialogOpen={setIsCreateDialogOpen} />
            <DeleteConfirmationDialog
                isOpen={isDeleteDialogOpen}
                onOpenChange={setIsDeleteDialogOpen}
                onDelete={async () => {
                    if (keyToDelete) {
                        await deleteApiKeyMutation.mutateAsync(keyToDelete.id)
                    }
                }}
                onDeleteSuccess={() => {
                    setKeyToDelete(null)
                }}
                title={t("apiKeys.key_deleted")}
                description={keyToDelete ? t("apiKeys.confirm_delete", { name: keyToDelete.name }) : ""}
            />
        </>
    )
}

export default ApiKeys
