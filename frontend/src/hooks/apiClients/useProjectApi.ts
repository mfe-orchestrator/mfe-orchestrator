import useApiClient from "../useApiClient";
import ApiResponseDTO from "@/types/ApiResponseDTO";

export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
  // Add other project properties as needed
  [key: string]: any;
}

const useProjectApi = () => {
  const apiClient = useApiClient();

  const getProjects = async (): Promise<Project[]> => {
    try {
      const response = await apiClient.doRequest<ApiResponseDTO<Project[]>>({
        url: "/api/projects/mine",
      });
      return response.data.data;
    } catch (error) {
      console.error("Error fetching projects:", error);
      throw error;
    }
  };

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

  const createProject = async (project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> => {
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
    getMineProjects: getProjects,
    getProjectById,
    createProject,
    updateProject,
    deleteProject
  };
};

export default useProjectApi;
