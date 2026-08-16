import { Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Switch, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@mfe-orchestrator/design-system"
import { UseQueryResult, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Trash2, UserPlus } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useParams } from "react-router-dom"
import { Badge, Button } from "@/components/atoms"
import { ApiStatusHandler } from "@/components/organisms"
import SinglePageLayout from "@/components/SinglePageLayout"
import { DeleteConfirmationDialog } from "@/components/ui/DeleteConfirmationDialog"
import useCanaryUsersApi, { CanaryUser } from "@/hooks/apiClients/useCanaryUsersApi"
import useToastNotificationStore from "@/store/useToastNotificationStore"

/**
 * Ids are typed by hand because they belong to the host application, not to this console: whatever it
 * passes to the SDK as `userId` is the string we have to match. Splitting on commas, semicolons and
 * newlines is there so a list pasted out of a spreadsheet or a query result enrols in one go.
 */
const parseUserIds = (value: string): string[] => [...new Set(value.split(/[\s,;]+/).filter(Boolean))]

export const CanaryUsers: React.FC = () => {
    const { t } = useTranslation()
    const { deploymentId } = useParams<{ deploymentId: string }>()
    const canaryUsersApi = useCanaryUsersApi()
    const queryClient = useQueryClient()
    const notifications = useToastNotificationStore()

    const [newUserIds, setNewUserIds] = useState("")
    const [userToRemove, setUserToRemove] = useState<CanaryUser | undefined>()

    const query: UseQueryResult<CanaryUser[]> = useQuery({
        queryKey: ["canaryUsers", deploymentId],
        queryFn: () => canaryUsersApi.getCanaryUsers(deploymentId!),
        enabled: !!deploymentId
    })

    const refresh = () => queryClient.invalidateQueries({ queryKey: ["canaryUsers", deploymentId] })

    const addMutation = useMutation({
        mutationFn: (userIds: string[]) => canaryUsersApi.setCanaryUsers(deploymentId!, userIds, true),
        onSuccess: async () => {
            setNewUserIds("")
            await refresh()
            notifications.showSuccessNotification({ message: t("deployments.canary_users.added_success") })
        }
    })

    // The same endpoint that creates a row also flips one, so enabling and disabling is one call.
    const toggleMutation = useMutation({
        mutationFn: ({ userId, enabled }: { userId: string; enabled: boolean }) => canaryUsersApi.setCanaryUsers(deploymentId!, [userId], enabled),
        onSuccess: async () => {
            await refresh()
            notifications.showSuccessNotification({ message: t("deployments.canary_users.updated_success") })
        }
    })

    const removeMutation = useMutation({
        mutationFn: (userId: string) => canaryUsersApi.deleteCanaryUsers(deploymentId!, [userId]),
        onSuccess: async () => {
            await refresh()
            notifications.showSuccessNotification({ message: t("deployments.canary_users.removed_success") })
        }
    })

    const parsedNewUserIds = parseUserIds(newUserIds)

    return (
        <ApiStatusHandler queries={[query]}>
            <SinglePageLayout title={t("deployments.canary_users.title")} description={t("deployments.canary_users.subtitle")}>
                <Card>
                    <CardHeader>
                        <CardTitle className="mb-0">{t("deployments.canary_users.add_title")}</CardTitle>
                        <CardDescription>{t("deployments.canary_users.add_description")}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form
                            className="flex flex-wrap items-center gap-2"
                            onSubmit={event => {
                                event.preventDefault()
                                if (parsedNewUserIds.length > 0) {
                                    addMutation.mutate(parsedNewUserIds)
                                }
                            }}
                        >
                            <Input
                                className="flex-[1_1_260px]"
                                value={newUserIds}
                                onChange={event => setNewUserIds(event.target.value)}
                                placeholder={t("deployments.canary_users.user_id_placeholder")}
                                aria-label={t("deployments.canary_users.columns.user")}
                            />
                            <Button type="submit" disabled={parsedNewUserIds.length === 0 || addMutation.isPending}>
                                <UserPlus />
                                {t("deployments.canary_users.add_button")}
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/60 hover:bg-muted/60">
                                    <TableHead>{t("deployments.canary_users.columns.user")}</TableHead>
                                    <TableHead>{t("deployments.canary_users.columns.status")}</TableHead>
                                    <TableHead className="text-right">{t("common.actions")}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {query.data?.length ? (
                                    query.data.map(canaryUser => (
                                        <TableRow key={canaryUser._id} className="border-divider hover:bg-primary/5">
                                            <TableCell className="max-w-[24rem] truncate font-medium" title={canaryUser.userId}>
                                                {canaryUser.userId}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <Switch
                                                        checked={canaryUser.enabled}
                                                        disabled={toggleMutation.isPending}
                                                        onCheckedChange={enabled => toggleMutation.mutate({ userId: canaryUser.userId, enabled })}
                                                        aria-label={t("deployments.canary_users.columns.status")}
                                                    />
                                                    <Badge variant={canaryUser.enabled ? "default" : "outline"}>
                                                        {canaryUser.enabled ? t("deployments.canary_users.enabled") : t("deployments.canary_users.disabled")}
                                                    </Badge>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="secondary" size="sm" onClick={() => setUserToRemove(canaryUser)} aria-label={t("common.delete")}>
                                                    <Trash2 />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={3} className="h-24 text-center text-foreground-secondary">
                                            {t("deployments.canary_users.no_users")}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                <DeleteConfirmationDialog
                    isOpen={Boolean(userToRemove)}
                    onOpenChange={open => !open && setUserToRemove(undefined)}
                    onDelete={async () => {
                        if (userToRemove) {
                            await removeMutation.mutateAsync(userToRemove.userId)
                        }
                    }}
                    onDeleteSuccess={() => setUserToRemove(undefined)}
                    title={t("deployments.canary_users.remove_title")}
                    description={t("deployments.canary_users.remove_description", { userId: userToRemove?.userId })}
                />
            </SinglePageLayout>
        </ApiStatusHandler>
    )
}

export default CanaryUsers
