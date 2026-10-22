import { Avatar, AvatarFallback, Card, EmptyState, SectionHeader, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@mfe-orchestrator/design-system"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { MailCheck, RefreshCw, Trash2, X } from "lucide-react"
import React, { useMemo, useState } from "react"
import Gravatar from "react-gravatar"
import { useTranslation } from "react-i18next"
import { Badge, Button } from "@/components/atoms"
import { DeleteConfirmationDialog } from "@/components/ui/DeleteConfirmationDialog"
import useOrganizationApi, { Organization, OrganizationUser, RoleInOrganization } from "@/hooks/apiClients/useOrganizationApi"
import useThemeStore from "@/store/useThemeStore"
import useToastNotificationStore from "@/store/useToastNotificationStore"
import { AddOrganizationUserButton, ORGANIZATION_USERS_QUERY_KEY } from "./AddOrganizationUserButton"

const getUserInitials = (user: { name?: string; surname?: string; email: string }) => {
    if (user.name && user.surname) return `${user.name[0]} ${user.surname[0]}`.toUpperCase()
    if (user.name) return user.name[0].toUpperCase()
    if (user.surname) return user.surname[0].toUpperCase()
    return user.email?.[0]?.toUpperCase() ?? "?"
}

const getUserFullName = (user: OrganizationUser) => (user.name || user.surname ? `${user.name || ""} ${user.surname || ""}`.trim() : "")

const UserIdentity: React.FC<{ user: OrganizationUser }> = ({ user }) => (
    <div className="flex items-center gap-3">
        <Avatar className="h-8 w-8">
            <Gravatar email={user.email} className="rounded-full" />
            <AvatarFallback>{getUserInitials(user)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
            <div className="truncate font-medium">{getUserFullName(user) || user.email}</div>
            {getUserFullName(user) && <div className="truncate text-sm text-muted-foreground">{user.email}</div>}
        </div>
    </div>
)

interface OrganizationMembersSectionProps {
    organization: Organization
    users: OrganizationUser[]
    canAdminister: boolean
}

/**
 * Who belongs to the organization, and with what standing, plus the invitations still waiting for an answer.
 *
 * Deliberately separate from the project members page: an organization role says which projects a
 * person can reach at all, while the project role says what they can do inside one of them.
 */
export const OrganizationMembersSection: React.FC<OrganizationMembersSectionProps> = ({ organization, users, canAdminister }) => {
    const { t } = useTranslation()
    const organizationApi = useOrganizationApi()
    const notifications = useToastNotificationStore()
    const queryClient = useQueryClient()
    const { getLocale } = useThemeStore()
    const [deleteDialog, setDeleteDialog] = useState<{ isOpen: boolean; userId?: string; userName?: string; mode?: "remove" | "revoke" }>({ isOpen: false })

    const members = useMemo(() => users.filter(user => !user.invitationPending), [users])
    const pendingInvites = useMemo(() => users.filter(user => user.invitationPending), [users])
    const ownerCount = members.filter(user => user.role === RoleInOrganization.OWNER).length

    const invalidate = () => queryClient.invalidateQueries({ queryKey: [ORGANIZATION_USERS_QUERY_KEY, organization._id] })

    const removeMutation = useMutation({
        // The mode travels with the call: the dialog that held it is already closed when the call returns.
        mutationFn: ({ userId }: { userId: string; mode?: "remove" | "revoke" }) => organizationApi.removeUser(organization._id, userId),
        onSuccess: (_, { mode }) => {
            invalidate()
            notifications.showSuccessNotification({
                message: mode === "revoke" ? t("organization_users.invite_revoked") : t("organization_users.user_removed")
            })
        }
    })

    const roleMutation = useMutation({
        mutationFn: ({ userId, role }: { userId: string; role: RoleInOrganization }) => organizationApi.updateUserRole(organization._id, userId, role),
        onSuccess: () => {
            invalidate()
            notifications.showSuccessNotification({ message: t("organization_users.role_updated") })
        }
    })

    const resendMutation = useMutation({
        mutationFn: (userId: string) => organizationApi.resendInvitation(organization._id, userId),
        onSuccess: () => {
            invalidate()
            notifications.showSuccessNotification({ message: t("organization_users.invite_resent") })
        }
    })

    // The last owner is what keeps the organization administrable: they can be neither removed nor demoted.
    const isLastOwner = (user: OrganizationUser) => user.role === RoleInOrganization.OWNER && ownerCount === 1

    const formatExpiry = (date?: string) => (date ? format(new Date(date), "PPP", { locale: getLocale() }) : "")

    return (
        <div className="space-y-8">
            <div className="space-y-4" data-testid="organization-members">
                <SectionHeader
                    title={t("organization_users.user_count", { count: members.length })}
                    description={t("organization_users.subtitle", { organization: organization.name })}
                    actions={canAdminister ? <AddOrganizationUserButton /> : undefined}
                />
                {members.length === 0 ? (
                    <Card>
                        <EmptyState size="sm" description={t("organization_users.no_users")} />
                    </Card>
                ) : (
                    <Card>
                        <Table>
                            <TableHeader tinted={false}>
                                <TableRow>
                                    <TableHead>{t("organization_users.user")}</TableHead>
                                    <TableHead>{t("organization_users.role")}</TableHead>
                                    <TableHead>{t("organization_users.projects")}</TableHead>
                                    {canAdminister && <TableHead className="w-[100px] text-center">{t("common.actions")}</TableHead>}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {members.map(user => (
                                    <TableRow key={user._id} data-testid={`organization-member-${user.email}`}>
                                        <TableCell>
                                            <UserIdentity user={user} />
                                        </TableCell>
                                        <TableCell>
                                            {canAdminister && !isLastOwner(user) ? (
                                                // A plain select rather than the design system's field: this one is not
                                                // part of a form, it commits the change as soon as it is made.
                                                <select
                                                    className="rounded-md border border-divider bg-background px-2 py-1 text-sm"
                                                    value={user.role}
                                                    disabled={roleMutation.isPending}
                                                    aria-label={t("organization_users.role")}
                                                    data-testid={`organization-role-${user.email}`}
                                                    onChange={event => roleMutation.mutate({ userId: user._id, role: event.target.value as RoleInOrganization })}
                                                >
                                                    <option value={RoleInOrganization.OWNER}>{t("organization_users.roles.owner")}</option>
                                                    <option value={RoleInOrganization.ADMIN}>{t("organization_users.roles.admin")}</option>
                                                    <option value={RoleInOrganization.MEMBER}>{t("organization_users.roles.member")}</option>
                                                </select>
                                            ) : (
                                                <Badge variant={user.role === RoleInOrganization.OWNER ? "accent" : "default"}>{user.role}</Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">
                                            {user.role === RoleInOrganization.MEMBER ? t("organization_users.project_count", { count: user.projectCount }) : t("organization_users.all_projects")}
                                        </TableCell>
                                        {canAdminister && (
                                            <TableCell className="text-center">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    title={t("common.remove")}
                                                    disabled={isLastOwner(user) || removeMutation.isPending}
                                                    onClick={() => setDeleteDialog({ isOpen: true, userId: user._id, userName: getUserFullName(user) || user.email, mode: "remove" })}
                                                >
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                            </TableCell>
                                        )}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </Card>
                )}
            </div>

            {pendingInvites.length > 0 && (
                <div className="space-y-4" data-testid="organization-pending-invites">
                    <SectionHeader as="h3" icon={<MailCheck />} title={t("organization_users.pending_invites", { count: pendingInvites.length })} />
                    <Card>
                        <Table>
                            <TableHeader tinted={false}>
                                <TableRow>
                                    <TableHead>{t("organization_users.email")}</TableHead>
                                    <TableHead>{t("organization_users.role")}</TableHead>
                                    <TableHead>{t("organization_users.invite_expires")}</TableHead>
                                    {canAdminister && <TableHead className="w-[140px] text-right">{t("common.actions")}</TableHead>}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {pendingInvites.map(user => (
                                    <TableRow key={user._id} data-testid={`organization-pending-invite-${user.email}`}>
                                        <TableCell>
                                            <UserIdentity user={user} />
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="accent">{user.role}</Badge>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">{formatExpiry(user.invitationExpiresAt)}</TableCell>
                                        {canAdminister && (
                                            <TableCell>
                                                <div className="flex items-center justify-end gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => resendMutation.mutate(user._id)}
                                                        disabled={resendMutation.isPending}
                                                        title={t("organization_users.resend_invite")}
                                                    >
                                                        <RefreshCw className="h-4 w-4" />
                                                        <span className="hidden sm:inline">{t("organization_users.resend_invite")}</span>
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => setDeleteDialog({ isOpen: true, userId: user._id, userName: user.email, mode: "revoke" })}
                                                        disabled={removeMutation.isPending}
                                                        title={t("organization_users.revoke_invite")}
                                                    >
                                                        <X className="h-4 w-4 text-destructive" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        )}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </Card>
                </div>
            )}

            <DeleteConfirmationDialog
                isOpen={deleteDialog.isOpen}
                onOpenChange={open => setDeleteDialog({ isOpen: open })}
                onDelete={async () => {
                    if (deleteDialog.userId) {
                        removeMutation.mutate({ userId: deleteDialog.userId, mode: deleteDialog.mode })
                        setDeleteDialog({ isOpen: false })
                    }
                }}
                title={deleteDialog.mode === "revoke" ? t("organization_users.confirm_revoke_title") : t("organization_users.confirm_remove_title")}
                description={
                    deleteDialog.mode === "revoke" ? t("organization_users.confirm_revoke", { name: deleteDialog.userName }) : t("organization_users.confirm_remove", { name: deleteDialog.userName })
                }
            />
        </div>
    )
}

export default OrganizationMembersSection
