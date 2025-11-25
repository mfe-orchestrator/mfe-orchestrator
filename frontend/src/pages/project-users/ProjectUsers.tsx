import { Badge, Button } from "@/components/atoms";
import { ApiStatusHandler } from "@/components/organisms";
import SinglePageLayout from "@/components/SinglePageLayout";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteConfirmationDialog } from "@/components/ui/DeleteConfirmationDialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TabsContent } from "@/components/ui/tabs/partials/tabsContent/tabsContent";
import { TabsList } from "@/components/ui/tabs/partials/tabsList/tabsList";
import { TabsTrigger } from "@/components/ui/tabs/partials/tabsTrigger/tabsTrigger";
import { Tabs } from "@/components/ui/tabs/tabs";
import { RoleInProject } from "@/hooks/apiClients/useProjectApi";
import useProjectUserApi, { ProjectUser } from "@/hooks/apiClients/useProjectUserApi";
import useProjectStore from "@/store/useProjectStore";
import useToastNotificationStore from "@/store/useToastNotificationStore";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutGrid, StretchHorizontal, Trash2 } from "lucide-react";
import React, { useState } from "react";
import Gravatar from "react-gravatar";
import { useTranslation } from "react-i18next";
import { AddUserButton, UserPicture } from "./partials";

const getUserInitials = (user?: { name?: string; surname?: string; email: string }) => {
  if (!user) return "";
  if (user.name && user.surname) {
    return `${user.name[0]} ${user.surname[0]}`.toUpperCase();
  }
  if (user.name) return user.name[0].toUpperCase();
  if (user.surname) return user.surname[0].toUpperCase();
  return user?.email?.[0].toUpperCase();
};

const UserCard: React.FC<{
  user: ProjectUser;
  handleDeleteUser: (userId: string, userName: string) => void;
  deleteUserDisabled: boolean;
  isOwner: boolean;
}> = ({ user, handleDeleteUser, deleteUserDisabled, isOwner }) => {
  const { t } = useTranslation();

  return (
    <Card
      key={user._id}
      className="w-full h-full relative">
      <CardContent>
        <div className="flex flex-col items-center gap-4">
          <UserPicture
            userEmail={user.email}
            userInitials={getUserInitials(user)}
          />
          <Badge
            variant={user.role === "OWNER" ? "accent" : "default"}
            className="absolute top-2 right-2">
            {user.role}
          </Badge>
          <div className="flex flex-col items-center">
            <CardTitle className="text-lg font-medium mb-0">
              {user.name || user.surname ? (
                `${user.name || ""} ${user.surname || ""}`.trim()
              ) : (
                <div></div>
              )}
            </CardTitle>
            <address className="text-sm text-foreground-secondary not-italic">{user.email}</address>
          </div>
          {!isOwner && (
            <Button
              variant="destructive"
              className="w-full"
              onClick={() => handleDeleteUser(user._id, user.name || user.email)}
              disabled={deleteUserDisabled}>
              <Trash2 />
              {t("common.remove")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

const ProjectUsers: React.FC = () => {
  const { t } = useTranslation();
  const { project } = useProjectStore();
  const notifications = useToastNotificationStore();
  const projectUserApi = useProjectUserApi();
  const queryClient = useQueryClient();
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    userId?: string;
    userName?: string;
  }>({ isOpen: false });

  const userQuery = useQuery({
    queryKey: ["projectUsers", project?._id],
    queryFn: () => projectUserApi.getProjectUsers(project?._id || ""),
    enabled: !!project?._id,
  });

  const { data: users = [] } = userQuery;

  const deleteUserMutation = useMutation({
    mutationFn: (userId: string) =>
      projectUserApi.removeUserFromProject(project?._id || "", userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projectUsers", project?._id] });
      notifications.showSuccessNotification({
        message: t("project_users.user_removed"),
      });
    },
  });

  const handleDeleteUser = (userId: string, userName: string) => {
    setDeleteDialog({ isOpen: true, userId, userName });
  };

  const confirmDeleteUser = async () => {
    if (deleteDialog.userId) {
      deleteUserMutation.mutate(deleteDialog.userId);
      setDeleteDialog({ isOpen: false });
    }
  };

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
    );
  }

  return (
    <ApiStatusHandler queries={[userQuery]}>
      <SinglePageLayout
        title={t("project_users.title")}
        description={t("project_users.subtitle")}
        right={<AddUserButton />}>
        <div>
          <Tabs
            defaultValue="grid"
            className="space-y-4"
            iconButtons>
            <div className="flex items-start justify-between gap-x-6 gap-y-2 flex-wrap">
              <div className="flex-[1_1_280px] max-w-[600px]">
                <h2 className="text-xl font-semibold text-foreground-secondary">
                  {t("project_users.user_count", { count: users.length })}
                </h2>
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

            <TabsContent value="table">
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("project_users.user")}</TableHead>
                      <TableHead>{t("project_users.role")}</TableHead>
                      <TableHead>{t("project_users.invite_state")}</TableHead>
                      <TableHead className="w-[100px]">{t("common.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => {
                      return (
                        <TableRow key={user._id}>
                          <TableCell className="flex items-center space-x-3">
                            <Avatar className="h-8 w-8">
                              <Gravatar
                                email={user.email}
                                className="rounded-full"
                              />
                              <AvatarFallback>{getUserInitials(user)}</AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium">
                                {user.name || user.surname ? (
                                  `${user.name || ""} ${user.surname || ""}`.trim()
                                ) : (
                                  <div></div>
                                )}
                              </div>
                              <div className="text-sm text-muted-foreground">{user.email}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge>{user.role}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={user.invitationToken ? "accent" : "default"}>
                              {user.invitationToken
                                ? t("project_users.invited")
                                : t("project_users.accepted")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteUser(user._id, user.name || user.email)}
                              disabled={
                                (user.role === RoleInProject.OWNER &&
                                  users.filter((user) => user.role === RoleInProject.OWNER)
                                    .length === 1) ||
                                deleteUserMutation.isPending ||
                                users.length === 1
                              }>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
            </TabsContent>

            <TabsContent
              value="grid"
              className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {users.map((user) => (
                  <UserCard
                    key={user._id}
                    user={user}
                    handleDeleteUser={handleDeleteUser}
                    deleteUserDisabled={
                      (user.role === RoleInProject.OWNER &&
                        users.filter((user) => user.role === RoleInProject.OWNER).length === 1) ||
                      deleteUserMutation.isPending ||
                      users.length === 1
                    }
                    isOwner={
                      user.role === RoleInProject.OWNER &&
                      users.filter((user) => user.role === RoleInProject.OWNER).length === 1
                    }
                  />
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </SinglePageLayout>

      <DeleteConfirmationDialog
        isOpen={deleteDialog.isOpen}
        onOpenChange={(open) => setDeleteDialog({ isOpen: open })}
        onDelete={confirmDeleteUser}
        title={t("project_users.confirm_remove_title")}
        description={t("project_users.confirm_remove", { name: deleteDialog.userName })}
      />
    </ApiStatusHandler>
  );
};

export default ProjectUsers;
