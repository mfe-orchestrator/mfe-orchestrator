import ApiDataFetcher from "@/components/ApiDataFetcher/ApiDataFetcher"
import SinglePageHeader from "@/components/SinglePageHeader"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge/badge"
import { Button } from "@/components/ui/button/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { TabsContent } from "@/components/ui/tabs/partials/tabsContent/tabsContent"
import { TabsList } from "@/components/ui/tabs/partials/tabsList/tabsList"
import { TabsTrigger } from "@/components/ui/tabs/partials/tabsTrigger/tabsTrigger"
import { Tabs } from "@/components/ui/tabs/tabs"
import useProjectUserApi from "@/hooks/apiClients/useProjectUserApi"
import useProjectStore from "@/store/useProjectStore"
import useToastNotificationStore from "@/store/useToastNotificationStore"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Trash2 } from "lucide-react"
import React, { useState } from "react"
import Gravatar from "react-gravatar"
import { useTranslation } from "react-i18next"
import { AddUserButton } from "./AddUserButton"
import SinglePageLayout from "@/components/SinglePageLayout"

type ViewType = "table" | "grid"

const ProjectUsersList: React.FC = () => {
    const { t } = useTranslation()
    const { project } = useProjectStore()
    const notifications = useToastNotificationStore()
    const projectUserApi = useProjectUserApi()
    const queryClient = useQueryClient()
    const [viewType, setViewType] = useState<ViewType>("table")

    const userQuery = useQuery({
        queryKey: ["projectUsers", project?._id],
        queryFn: () => projectUserApi.getProjectUsers(project?._id || ""),
        enabled: !!project?._id
    })

    const { data: users = [] } = userQuery

    const deleteUserMutation = useMutation({
        mutationFn: (userId: string) => projectUserApi.removeUserFromProject(project?._id || "", userId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["projectUsers", project?._id] })
            notifications.showSuccessNotification({
                message: t("project_users.user_removed")
            })
        }
    })

    const handleDeleteUser = (userId: string, userName: string) => {
        if (window.confirm(t("project_users.confirm_remove", { name: userName }))) {
            deleteUserMutation.mutate(userId)
        }
    }

    const getUserInitials = (user?: { name?: string; surname?: string; email: string }) => {
        if (!user) return ""
        if (user.name && user.surname) {
            return `${user.name[0]}${user.surname[0]}`.toUpperCase()
        }
        if (user.name) return user.name[0].toUpperCase()
        if (user.surname) return user.surname[0].toUpperCase()
        return user?.email?.[0].toUpperCase()
    }

    const renderUserCard = (user: any) => (
        <Card key={user._id} className="w-full sm:w-[300px] h-full">
            <CardContent className="pt-6">
                <div className="flex flex-col items-center space-y-4">
                    <Avatar className="h-20 w-20">
                        <Gravatar email={user.email} className="rounded-full" />
                        <AvatarFallback>{getUserInitials(user)}</AvatarFallback>
                    </Avatar>
                    <div className="text-center space-y-1">
                        <h3 className="text-lg font-medium">{user.name || user.surname ? `${user.name || ""} ${user.surname || ""}`.trim() : t("project_users.no_name")}</h3>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                        <Badge className="mt-2">{user.role}</Badge>
                    </div>
                    <Button variant="secondary" size="sm" className="w-full" onClick={() => handleDeleteUser(user._id, user.name || user.email)} disabled={deleteUserMutation.isPending}>
                        <Trash2 className="mr-2 h-4 w-4 text-destructive" />
                        {t("common.remove")}
                    </Button>
                </div>
            </CardContent>
        </Card>
    )

    if (users.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>{t("project_users.title")}</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-center py-8 text-muted-foreground">{t("project_users.no_users")}</p>
                </CardContent>
            </Card>
        )
    }

    return (
        <ApiDataFetcher queries={[userQuery]}>
            <SinglePageLayout
                title={t("project_users.title")}
                description={t("project_users.subtitle", { count: users.length })}
                right={
                    <>
                        <AddUserButton />
                    </>
                }
            >
                <div>
                    <Tabs defaultValue="table" className="space-y-4" tabsListPosition="end" onValueChange={value => setViewType(value as ViewType)}>
                        <TabsList>
                            <TabsTrigger value="table">{t("project_users.table_view")}</TabsTrigger>
                            <TabsTrigger value="grid">{t("project_users.grid_view")}</TabsTrigger>
                        </TabsList>

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
                                    <TableBody>{users.map(user => {

                                        return <TableRow key={user._id}>
                                            <TableCell className="flex items-center space-x-3">
                                                <Avatar className="h-8 w-8">
                                                    <Gravatar email={user.email} className="rounded-full" />
                                                    <AvatarFallback>{getUserInitials(user)}</AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <div className="font-medium">{user.name || user.surname ? `${user.name || ""} ${user.surname || ""}`.trim() : t("project_users.no_name")}</div>
                                                    <div className="text-sm text-muted-foreground">{user.email}</div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge>{user.role}</Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="icon" onClick={() => handleDeleteUser(user._id, user.name || user.email)} disabled={deleteUserMutation.isPending}>
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    })}</TableBody>
                                </Table>
                            </Card>
                        </TabsContent>

                        <TabsContent value="grid" className="space-y-4">
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{users.map(user => renderUserCard(user))}</div>
                        </TabsContent>
                    </Tabs>
                </div>
            </SinglePageLayout>
        </ApiDataFetcher>
    )
}

export default ProjectUsersList
