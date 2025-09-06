import useApiClient from "../useApiClient";
import { EnvironmentDTO } from "./useEnvironmentsApi";

export enum RoleInProject {
  OWNER = "OWNER",
  MEMBER = "MEMBER",
  VIEWER = "VIEWER"
}

export interface Project {
  name: string;
  slug: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
  _id: string
}

export interface ProjectSummaryDTO {
  project: Project,
  count: {
    environments: number,
    users: number,
    microfrontends: number,
    codeRepositories: number,
    apiKeys: number,
    storages: number
  }
}

interface AddUserToProjectDTO {
  email: string
  role: RoleInProject
}

const useProjectApi = () => {
  const apiClient = useApiClient();

  const getMineProjects = async (): Promise<Project[]> => {
    const response = await apiClient.doRequest<Project[]>({
      url: "/api/projects/mine",
    });
    return response.data;
  };

  const getEnvironmentsByProjectId = async (projectId: string): Promise<EnvironmentDTO[]> => {
    const response = await apiClient.doRequest<EnvironmentDTO[]>({
      url: `/api/projects/${projectId}/environments`,
    });
    return response.data;
  }

  const getProjectById = async (id: string): Promise<Project> => {
    const response = await apiClient.doRequest<Project>({
      url: `/api/projects/${id}`,
      method: "GET"
    });
    return response.data;
  };

  const getProjectSummaryById = async (id: string): Promise<ProjectSummaryDTO> => {
    const response = await apiClient.doRequest<ProjectSummaryDTO>({
      url: `/api/projects/${id}/summary`,
      method: "GET"
    });
    return response.data;
  };

  const createProject = async (project: Omit<Project, '_id' | 'createdAt' | 'updatedAt'>): Promise<Project> => {
    const response = await apiClient.doRequest<Project>({
      url: "/api/projects",
      method: "POST",
      data: project
    });
    return response.data;
  };

  const updateProject = async (id: string, project: Partial<Project>): Promise<Project> => {
    const response = await apiClient.doRequest<Project>({
      url: `/api/projects/${id}`,
      method: "PUT",
      data: project
    });
    return response.data;
  };

  const deleteProject = async (id: string): Promise<void> => {
    await apiClient.doRequest({
      url: `/api/projects/${id}`,
      method: "DELETE"
    });
  };

  const inviteUser = async (dto: AddUserToProjectDTO & { projectId: string }): Promise<void> => {
    await apiClient.doRequest({
      url: `/api/projects/${dto.projectId}/users`,
      method: "POST",
      data: dto
    });
  };

  return {
    getMineProjects: getMineProjects,
    getProjectById,
    createProject,
    updateProject,
    getProjectSummaryById,
    deleteProject,
    getEnvironmentsByProjectId,
    inviteUser
  };
};

export default useProjectApi;
