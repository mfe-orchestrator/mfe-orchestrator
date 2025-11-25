import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GitBranch, HardDrive, Key, Server, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

// Hooks & Stores
import useProjectApi, { Project } from "@/hooks/apiClients/useProjectApi";
import useProjectStore from "@/store/useProjectStore";
import useToastNotificationStore from "@/store/useToastNotificationStore";

// Components
import { ApiStatusHandler } from "@/components/organisms";
import SinglePageLayout from "@/components/SinglePageLayout";
import { DangerZone, ProjectInfoSection, ProjectStatsSection } from "./partials";

export const Settings: React.FC = () => {
  const notifications = useToastNotificationStore();
  const { t } = useTranslation();
  const { project, setProject } = useProjectStore();
  const projectApi = useProjectApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const projectQuery = useQuery({
    queryKey: ["project-summary", project._id],
    queryFn: () => projectApi.getProjectSummaryById(project._id),
    enabled: !!project._id,
  });

  const handleDeleteProjectSuccess = async () => {
    notifications.showSuccessNotification({ message: t("settings.notifications.projectDeleted") });
    queryClient.invalidateQueries({ queryKey: ["projects"] });
    setProject(null);
    navigate("/");
  };

  const updateProjectMutation = useMutation({
    mutationFn: (projectData: Partial<Project>) =>
      projectApi.updateProject(project._id, projectData),
  });

  const handleProjectNameUpdate = async (newName: string) => {
    if (!newName.trim()) return;

    try {
      //await updateProjectName(newName);
      notifications.showSuccessNotification({
        message: t("settings.notifications.projectNameUpdated"),
      });
    } catch (error) {
      console.error("Failed to update project name:", error);
      notifications.showErrorNotification({
        message: t("settings.notifications.projectNameUpdateFailed"),
      });
      throw error; // Re-throw to let the component handle the error
    }
  };

  const projectData = projectQuery.data?.project;

  return (
    <ApiStatusHandler queries={[projectQuery]}>
      <SinglePageLayout
        title={t("settings.title")}
        description={t("settings.subtitle")}>
        {projectData && (
          <ProjectInfoSection
            {...projectData}
            onUpdateProjectName={handleProjectNameUpdate}
          />
        )}

        <ProjectStatsSection
          stats={[
            {
              icon: <Server />,
              title: t("settings.stats.environments"),
              value: projectQuery.data?.count?.environments,
              href: "/environments",
            },
            {
              icon: <Users />,
              title: t("settings.stats.teamMembers"),
              value: projectQuery.data?.count?.users,
              href: "/project-users",
            },
            {
              icon: <HardDrive />,
              title: t("settings.stats.storages"),
              value: projectQuery.data?.count?.storages,
              href: "/storages",
            },
            {
              icon: <Key />,
              title: t("settings.stats.apiKeys"),
              value: projectQuery.data?.count?.apiKeys,
              href: "/api-keys",
            },
            {
              icon: <GitBranch />,
              title: t("settings.stats.codeRepositories"),
              value: projectQuery.data?.count?.codeRepositories,
              href: "/code-repositories",
            },
          ]}
        />

        <DangerZone
          projectName={projectData?.name}
          projectId={projectData?._id}
          onDeleteSuccess={handleDeleteProjectSuccess}
        />
      </SinglePageLayout>
    </ApiStatusHandler>
  );
};

export default Settings;
