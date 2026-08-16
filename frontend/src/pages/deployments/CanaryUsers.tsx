import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Checkbox,
    EmptyStateRow,
    Input,
    Switch,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@mfe-orchestrator/design-system"
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
    const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
    const [usersToRemove, setUsersToRemove] = useState<string[]>([])

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

    // The same endpoint that creates a row also flips one, so enabling and disabling is one call —
    // and because it takes a list, the single row switch and the bulk buttons share it.
    const toggleMutation = useMutation({
        mutationFn: ({ userIds, enabled }: { userIds: string[]; enabled: boolean }) => canaryUsersApi.setCanaryUsers(deploymentId!, userIds, enabled),
        onSuccess: async (_data, { userIds }) => {
            await refresh()
            notifications.showSuccessNotification({ message: t("deployments.canary_users.updated_success", { count: userIds.length }) })
        }
    })

    const removeMutation = useMutation({
        mutationFn: (userIds: string[]) => canaryUsersApi.deleteCanaryUsers(deploymentId!, userIds),
        onSuccess: async (_data, userIds) => {
            setSelectedUserIds(current => current.filter(userId => !userIds.includes(userId)))
            await refresh()
            notifications.showSuccessNotification({ message: t("deployments.canary_users.removed_success", { count: userIds.length }) })
        }
    })

    const parsedNewUserIds = parseUserIds(newUserIds)
    const canaryUsers = query.data ?? []
    // Derived rather than trusted: a row may have disappeared under us since it was ticked.
    const selectedExistingUserIds = canaryUsers.filter(canaryUser => selectedUserIds.includes(canaryUser.userId)).map(canaryUser => canaryUser.userId)
    const allSelected = canaryUsers.length > 0 && selectedExistingUserIds.length === canaryUsers.length
    const bulkPending = toggleMutation.isPending || removeMutation.isPending

    const toggleAll = () => setSelectedUserIds(allSelected ? [] : canaryUsers.map(canaryUser => canaryUser.userId))

    const toggleOne = (userId: string) => setSelectedUserIds(current => (current.includes(userId) ? current.filter(selectedUserId => selectedUserId !== userId) : [...current, userId]))

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
                        {selectedExistingUserIds.length > 0 && (
                            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-divider bg-muted/40 px-3 py-2">
                                <span className="mr-auto text-sm text-foreground-secondary">{t("deployments.canary_users.selected_count", { count: selectedExistingUserIds.length })}</span>
                                <Button variant="secondary" size="sm" disabled={bulkPending} onClick={() => toggleMutation.mutate({ userIds: selectedExistingUserIds, enabled: true })}>
                                    {t("deployments.canary_users.enable_selected")}
                                </Button>
                                <Button variant="secondary" size="sm" disabled={bulkPending} onClick={() => toggleMutation.mutate({ userIds: selectedExistingUserIds, enabled: false })}>
                                    {t("deployments.canary_users.disable_selected")}
                                </Button>
                                <Button variant="destructive" size="sm" disabled={bulkPending} onClick={() => setUsersToRemove(selectedExistingUserIds)}>
                                    <Trash2 />
                                    {t("deployments.canary_users.remove_selected")}
                                </Button>
                            </div>
                        )}

                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/60 hover:bg-muted/60">
                                    <TableHead className="w-10">
                                        <Checkbox checked={allSelected} disabled={canaryUsers.length === 0} onCheckedChange={toggleAll} aria-label={t("deployments.canary_users.select_all")} />
                                    </TableHead>
                                    <TableHead>{t("deployments.canary_users.columns.user")}</TableHead>
                                    <TableHead>{t("deployments.canary_users.columns.status")}</TableHead>
                                    <TableHead className="text-right">{t("common.actions")}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {canaryUsers.length ? (
                                    canaryUsers.map(canaryUser => (
                                        <TableRow key={canaryUser._id} className="border-divider hover:bg-primary/5">
                                            <TableCell>
                                                <Checkbox
                                                    checked={selectedUserIds.includes(canaryUser.userId)}
                                                    onCheckedChange={() => toggleOne(canaryUser.userId)}
                                                    aria-label={t("deployments.canary_users.select_user", { userId: canaryUser.userId })}
                                                />
                                            </TableCell>
                                            <TableCell className="max-w-[24rem] truncate font-medium" title={canaryUser.userId}>
                                                {canaryUser.userId}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <Switch
                                                        checked={canaryUser.enabled}
                                                        disabled={toggleMutation.isPending}
                                                        onCheckedChange={enabled => toggleMutation.mutate({ userIds: [canaryUser.userId], enabled })}
                                                        aria-label={t("deployments.canary_users.columns.status")}
                                                    />
                                                    <Badge variant={canaryUser.enabled ? "default" : "outline"}>
                                                        {canaryUser.enabled ? t("deployments.canary_users.enabled") : t("deployments.canary_users.disabled")}
                                                    </Badge>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="secondary" size="sm" onClick={() => setUsersToRemove([canaryUser.userId])} aria-label={t("common.delete")}>
                                                    <Trash2 />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <EmptyStateRow colSpan={4}>{t("deployments.canary_users.no_users")}</EmptyStateRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                <DeleteConfirmationDialog
                    isOpen={usersToRemove.length > 0}
                    onOpenChange={open => !open && setUsersToRemove([])}
                    onDelete={async () => {
                        if (usersToRemove.length > 0) {
                            await removeMutation.mutateAsync(usersToRemove)
                        }
                    }}
                    onDeleteSuccess={() => setUsersToRemove([])}
                    title={t("deployments.canary_users.remove_title", { count: usersToRemove.length })}
                    description={t("deployments.canary_users.remove_description", { count: usersToRemove.length, userId: usersToRemove[0] })}
                />
            </SinglePageLayout>
        </ApiStatusHandler>
    )
}

export default CanaryUsers
