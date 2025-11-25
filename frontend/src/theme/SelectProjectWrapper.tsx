import { useTranslation } from "react-i18next";
import useProjectStore from "@/store/useProjectStore";
import { useQuery } from "@tanstack/react-query";
import useProjectApi from "@/hooks/apiClients/useProjectApi";
import { ApiStatusHandler } from "@/components/organisms";
import AuthenticationLayout from "@/authentication/components/AuthenticationLayout";
import { FormProvider, useForm } from "react-hook-form";
import TextField from "@/components/input/TextField.rhf";
import { Button } from "@/components/atoms";
import { Project } from "@/hooks/apiClients/useProjectApi";
import SelectField from "@/components/input/SelectField.rhf";
import {
  getProjectIdFromLocalStorage,
  setProjectIdInLocalStorage,
} from "@/utils/localStorageUtils";

interface CreateFirstProjectFormData {
  name: string;
}

interface SelectProjectFormData {
  projectId: string;
}

const CreateFirstProjectForm = () => {
  const { t } = useTranslation();
  const projectApi = useProjectApi();
  const projectStore = useProjectStore();
  const form = useForm<CreateFirstProjectFormData>();

  const onSubmit = async (data: CreateFirstProjectFormData) => {
    try {
      const project = await projectApi.createProject(data);
      projectStore.setProjects([project]);
      projectStore.setProject(project);
    } catch (error) {
      console.error(t("common.error"), error);
    }
  };

  return (
    <AuthenticationLayout
      title={t("project.no_projects_found")}
      description={t("project.create_new_project")}
      footer={
        <p className="text-sm text-muted-foreground text-center">{t("project.or_ask_admin")}</p>
      }>
      <FormProvider {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <div className="flex flex-col gap-4">
            <TextField
              name="name"
              label={t("common.name")}
              rules={{ required: t("validation.required") }}
            />
            <div className="flex justify-center">
              <Button type="submit">{t("common.create")}</Button>
            </div>
          </div>
        </form>
      </FormProvider>
    </AuthenticationLayout>
  );
};

interface SelectProjectFormData {
  projectId: string;
}

const SelectProjectForm: React.FC = () => {
  const { t } = useTranslation();
  const form = useForm<SelectProjectFormData>();
  const projectStore = useProjectStore();

  const onSubmit = async (data: SelectProjectFormData) => {
    try {
      // Handle project selection
      const selectedProject = projectStore.projects?.find((p) => p._id === data.projectId);
      if (selectedProject) {
        projectStore.setProject(selectedProject);
        setProjectIdInLocalStorage(selectedProject._id);
      }
    } catch (error) {
      console.error(t("common.error"), error);
    }
  };

  return (
    <AuthenticationLayout title={t("project.select_project")}>
      <FormProvider {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-4">
          <div className="flex flex-col gap-4">
            <SelectField
              name="projectId"
              className="p-2 border rounded-md w-full"
              rules={{ required: t("validation.required") }}
              options={projectStore.projects?.map((project: Project) => ({
                value: project._id,
                label: project.name,
              }))}
            />
            <div className="flex justify-end">
              <Button type="submit">{t("common.select")}</Button>
            </div>
          </div>
        </form>
      </FormProvider>
    </AuthenticationLayout>
  );
};

const SelectProjectWrapperInner: React.FC<React.PropsWithChildren> = ({ children }) => {
  const projectStore = useProjectStore();

  if (projectStore.project) {
    return <>{children}</>;
  }

  if (!projectStore.projects || projectStore.projects.length === 0) {
    return <CreateFirstProjectForm />;
  }

  return <SelectProjectForm />;
};

const SelectProjectWrapper: React.FC<React.PropsWithChildren> = (props) => {
  const projectApi = useProjectApi();
  const projectStore = useProjectStore();

  const projectsQuery = useQuery({
    queryKey: ["projects-mine"],
    queryFn: async () => {
      try {
        const projects = await projectApi.getMineProjects();
        projectStore.setProjects(projects);
        if (projects.length === 1) {
          projectStore.setProject(projects[0]);
          setProjectIdInLocalStorage(projects[0]._id);
        }
        //Here we have several projects
        const projectId = getProjectIdFromLocalStorage();
        if (projectId) {
          projectStore.setProject(projects.find((p) => p._id === projectId));
        }

        return projects;
      } catch (error) {
        console.error("Error fetching projects:", error);
        throw error;
      }
    },
  });

  return (
    <ApiStatusHandler queries={[projectsQuery]}>
      <SelectProjectWrapperInner {...props} />
    </ApiStatusHandler>
  );
};

export default SelectProjectWrapper;
