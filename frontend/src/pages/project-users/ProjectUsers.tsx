import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { LayoutGrid, MailCheck, RefreshCw, StretchHorizontal, Trash2, X } from "lucide-react"
import React, { useMemo, useState } from "react"
import Gravatar from "react-gravatar"
import { useTranslation } from "react-i18next"
import { Badge, Button } from "@/components/atoms"
import { ApiStatusHandler } from "@/components/organisms"
import SinglePageLayout from "@/components/SinglePageLayout"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DeleteConfirmationDialog } from "@/components/ui/DeleteConfirmationDialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { TabsContent } from "@/components/ui/tabs/partials/tabsContent/tabsContent"
import { TabsList } from "@/components/ui/tabs/partials/tabsList/tabsList"
import { TabsTrigger } from "@/components/ui/tabs/partials/tabsTrigger/tabsTrigger"
import { Tabs } from "@/components/ui/tabs/tabs"
import { RoleInProject } from "@/hooks/apiClients/useProjectApi"
import useProjectUserApi, { ProjectUser } from "@/hooks/apiClients/useProjectUserApi"
import useProjectStore from "@/store/useProjectStore"
import useThemeStore from "@/store/useThemeStore"
import useToastNotificationStore from "@/store/useToastNotificationStore"
import { AddUserButton, UserPicture } from "./partials"

const getUserInitials = (user?: { name?: string; surname?: string; email: string }) => {
    if (!user) return ""
    if (user.name && user.surname) {
        return `${user.name[0]} ${user.surname[0]}`.toUpperCase()
    }
    if (user.name) return user.name[0].toUpperCase()
    if (user.surname) return user.surname[0].toUpperCase()
    return user?.email?.[0].toUpperCase()
}

const getUserFullName = (user: ProjectUser) => (user.name || user.surname ? `${user.name || ""} ${user.surname || ""}`.trim() : "")

const UserCard: React.FC<{
    user: ProjectUser
    handleDeleteUser: (userId: string, userName: string) => void
    deleteUserDisabled: boolean
    isOwner: boolean
}> = ({ user, handleDeleteUser, deleteUserDisabled, isOwner }) => {
    const { t } = useTranslation()

    return (
        <Card key={user._id} className="w-full h-full relative">
            <CardContent>
                <div className="flex flex-col items-center gap-4">
                    <UserPicture userEmail={user.email} userInitials={getUserInitials(user)} />
                    <Badge variant={user.role === "OWNER" ? "accent" : "default"} className="absolute top-2 right-2">
                        {user.role}
                    </Badge>
                    <div className="flex flex-col items-center">
                        <CardTitle className="text-lg font-medium mb-0">{getUserFullName(user) || <div></div>}</CardTitle>
                        <address className="text-sm text-foreground-secondary not-italic">{user.email}</address>
                    </div>
                    {!isOwner && (
                        <Button variant="destructive" className="w-full" onClick={() => handleDeleteUser(user._id, user.name || user.email)} disabled={deleteUserDisabled}>
                            <Trash2 />
                            {t("common.remove")}
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}

const ProjectUsers: React.FC = () => {
    const { t } = useTranslation()
    const { project } = useProjectStore()
    const notifications = useToastNotificationStore()
    const projectUserApi = useProjectUserApi()
    const queryClient = useQueryClient()
    const { getLocale } = useThemeStore()
    const [deleteDialog, setDeleteDialog] = useState<{
        isOpen: boolean
        userId?: string
        userName?: string
        mode?: "remove" | "revoke"
    }>({ isOpen: false })

    const userQuery = useQuery({
        queryKey: ["projectUsers", project?._id],
        queryFn: () => projectUserApi.getProjectUsers(project?._id || ""),
        enabled: !!project?._id
    })

    const { data: allUsers = [] } = userQuery

    const members = useMemo(() => allUsers.filter(u => !u.invitationPending), [allUsers])
    const pendingInvites = useMemo(() => allUsers.filter(u => u.invitationPending), [allUsers])

    const invalidate = () => queryClient.invalidateQueries({ queryKey: ["projectUsers", project?._id] })

    const deleteUserMutation = useMutation({
        mutationFn: (userId: string) => projectUserApi.removeUserFromProject(project?._id || "", userId),
        onSuccess: () => {
            invalidate()
            notifications.showSuccessNotification({
                message: deleteDialog.mode === "revoke" ? t("project_users.invite_revoked") : t("project_users.user_removed")
            })
        }
    })

    const resendMutation = useMutation({
        mutationFn: (userId: string) => projectUserApi.resendInvitation(project?._id || "", userId),
        onSuccess: () => {
            invalidate()
            notifications.showSuccessNotification({ message: t("project_users.invite_resent") })
        }
    })

    const handleDeleteUser = (userId: string, userName: string) => {
        setDeleteDialog({ isOpen: true, userId, userName, mode: "remove" })
    }

    const handleRevokeInvite = (userId: string, userName: string) => {
        setDeleteDialog({ isOpen: true, userId, userName, mode: "revoke" })
    }

    const confirmDeleteUser = async () => {
        if (deleteDialog.userId) {
            deleteUserMutation.mutate(deleteDialog.userId)
            setDeleteDialog({ isOpen: false })
        }
    }

    const ownerCount = members.filter(u => u.role === RoleInProject.OWNER).length
    const isRemovalDisabled = (user: ProjectUser) => (user.role === RoleInProject.OWNER && ownerCount === 1) || deleteUserMutation.isPending || members.length === 1

    const formatExpiry = (date?: string) => (date ? format(new Date(date), "PPP", { locale: getLocale() }) : "")

    return (
        <ApiStatusHandler queries={[userQuery]}>
            <SinglePageLayout title={t("project_users.title")} description={t("project_users.subtitle")} right={<AddUserButton />}>
                <div className="space-y-8">
                    <Tabs defaultValue="grid" className="space-y-4" iconButtons>
                        <div className="flex items-start justify-between gap-x-6 gap-y-2 flex-wrap">
                            <div className="flex-[1_1_280px] max-w-[600px]">
                                <h2 className="text-xl font-semibold text-foreground-secondary">{t("project_users.user_count", { count: members.length })}</h2>
                            </div>
                            <TabsList>
                                <TabsTrigger value="grid">
                                    <LayoutGrid />
                                </TabsTrigger>
                                <TabsTrigger value="table">
                                    <StretchHorizontal />
                                </TabsTrigger>
                            </TabsList>
                        </div>

                        {members.length === 0 ? (
                            <Card>
                                <CardContent>
                                    <p className="text-center py-8 text-muted-foreground">{t("project_users.no_users")}</p>
                                </CardContent>
                            </Card>
                        ) : (
                            <>
                                <TabsContent value="table">
                                    <Card>
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>{t("project_users.user")}</TableHead>
                                                    <TableHead>{t("project_users.role")}</TableHead>
                                                    <TableHead className="w-[100px]">{t("common.actions")}</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {members.map(user => (
                                                    <TableRow key={user._id}>
                                                        <TableCell className="flex items-center space-x-3">
                                                            <Avatar className="h-8 w-8">
                                                                <Gravatar email={user.email} className="rounded-full" />
                                                                <AvatarFallback>{getUserInitials(user)}</AvatarFallback>
                                                            </Avatar>
                                                            <div>
                                                                <div className="font-medium">{getUserFullName(user) || <div></div>}</div>
                                                                <div className="text-sm text-muted-foreground">{user.email}</div>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge>{user.role}</Badge>
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <Button variant="ghost" size="icon" onClick={() => handleDeleteUser(user._id, user.name || user.email)} disabled={isRemovalDisabled(user)}>
                                                                <Trash2 className="h-4 w-4 text-destructive" />
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </Card>
                                </TabsContent>

                                <TabsContent value="grid" className="space-y-4">
                                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                        {members.map(user => (
                                            <UserCard
                                                key={user._id}
                                                user={user}
                                                handleDeleteUser={handleDeleteUser}
                                                deleteUserDisabled={isRemovalDisabled(user)}
                                                isOwner={user.role === RoleInProject.OWNER && ownerCount === 1}
                                            />
                                        ))}
                                    </div>
                                </TabsContent>
                            </>
                        )}
                    </Tabs>

                    {pendingInvites.length > 0 && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <MailCheck className="h-5 w-5 text-muted-foreground" />
                                <h2 className="text-xl font-semibold text-foreground-secondary">{t("project_users.pending_invites", { count: pendingInvites.length })}</h2>
                            </div>
                            <Card>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>{t("project_users.email")}</TableHead>
                                            <TableHead>{t("project_users.role")}</TableHead>
                                            <TableHead>{t("project_users.invite_expires")}</TableHead>
                                            <TableHead className="w-[140px] text-right">{t("common.actions")}</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {pendingInvites.map(user => (
                                            <TableRow key={user._id}>
                                                <TableCell>
                                                    <div className="flex items-center gap-3">
                                                        <Avatar className="h-8 w-8">
                                                            <Gravatar email={user.email} className="rounded-full" />
                                                            <AvatarFallback>{getUserInitials(user)}</AvatarFallback>
                                                        </Avatar>
                                                        <span className="font-medium">{user.email}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="accent">{user.role}</Badge>
                                                </TableCell>
                                                <TableCell className="text-muted-foreground">{formatExpiry(user.invitationExpiresAt)}</TableCell>
                                                <TableCell>
                                                    <div className="flex items-center justify-end gap-1">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => resendMutation.mutate(user._id)}
                                                            disabled={resendMutation.isPending}
                                                            title={t("project_users.resend_invite")}
                                                        >
                                                            <RefreshCw className="h-4 w-4" />
                                                            <span className="hidden sm:inline">{t("project_users.resend_invite")}</span>
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => handleRevokeInvite(user._id, user.email)}
                                                            disabled={deleteUserMutation.isPending}
                                                            title={t("project_users.revoke_invite")}
                                                        >
                                                            <X className="h-4 w-4 text-destructive" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </Card>
                        </div>
                    )}
                </div>
            </SinglePageLayout>

            <DeleteConfirmationDialog
                isOpen={deleteDialog.isOpen}
                onOpenChange={open => setDeleteDialog({ isOpen: open })}
                onDelete={confirmDeleteUser}
                title={deleteDialog.mode === "revoke" ? t("project_users.confirm_revoke_title") : t("project_users.confirm_remove_title")}
                description={deleteDialog.mode === "revoke" ? t("project_users.confirm_revoke", { name: deleteDialog.userName }) : t("project_users.confirm_remove", { name: deleteDialog.userName })}
            />
        </ApiStatusHandler>
    )
}

export default ProjectUsers
