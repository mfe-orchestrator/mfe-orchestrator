import useApiClient from "../useApiClient";

export interface Project {
  name: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
  _id: string
}

const useProjectApi = () => {
  const apiClient = useApiClient();

  const getMineProjects = async (): Promise<Project[]> => {
    try {
      const response = await apiClient.doRequest<Project[]>({
        url: "/api/projects/mine",
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching projects:", error);
      throw error;
    }
  };

  const getEnvironmentsByProjectId = async (projectId: string) => {
    const response = await apiClient.doRequest({
        url:`/api/projects/${projectId}/environments`,
    });
    return response.data;
}

  const getProjectById = async (id: string): Promise<Project> => {
    try {
      const response = await apiClient.doRequest<Project>({
        url: `/api/projects/${id}`,
        method: "GET"
      });
      return response.data;
    } catch (error) {
      console.error(`Error fetching project with id ${id}:`, error);
      throw error;
    }
  };

  const createProject = async (project: Omit<Project, '_id' | 'createdAt' | 'updatedAt'>): Promise<Project> => {
    try {
      const response = await apiClient.doRequest<Project>({
        url: "/api/projects",
        method: "POST",
        data: project
      });
      return response.data;
    } catch (error) {
      console.error("Error creating project:", error);
      throw error;
    }
  };

  const updateProject = async (id: string, project: Partial<Project>): Promise<Project> => {
    try {
      const response = await apiClient.doRequest<Project>({
        url: `/api/projects/${id}`,
        method: "PUT",
        data: project
      });
      return response.data;
    } catch (error) {
      console.error(`Error updating project with id ${id}:`, error);
      throw error;
    }
  };

  const deleteProject = async (id: string): Promise<void> => {
    try {
      await apiClient.doRequest({
        url: `/api/projects/${id}`,
        method: "DELETE"
      });
    } catch (error) {
      console.error(`Error deleting project with id ${id}:`, error);
      throw error;
    }
  };

  return {
    getMineProjects: getMineProjects,
    getProjectById,
    createProject,
    updateProject,
    deleteProject,
    getEnvironmentsByProjectId
  };
};

export default useProjectApi;
