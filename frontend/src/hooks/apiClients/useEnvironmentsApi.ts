import useApiClient from "../useApiClient"

export interface EnvironmentDTO {
    slug: string;
    name: string;
    description?: string;
    createdAt?: string;
    updatedAt?: string;
    color?: string;
    isProduction?: boolean;
    _id?: string
}

interface CreateEnvironmentDTO {
  name: string;
  slug: string;
  isProduction?: boolean;
  color?: string;
}

const useEnvironmentsApi = () => {
  const apiClient = useApiClient();

  const getEnvironment = async (id: string) => {
    const response = await apiClient.doRequest<EnvironmentDTO>({
      url: `/api/environments/${id}`,
    });
    return response.data;
  };

  const createEnvironment = async (data: CreateEnvironmentDTO) => {
    const response = await apiClient.doRequest<EnvironmentDTO>({
      url: `/api/environments`,
      method: 'POST',
      data
    });
    return response.data;
  };

  const createEnvironmentsBulk = async (data: CreateEnvironmentDTO[]) => {
    const response = await apiClient.doRequest<EnvironmentDTO[]>({
      url: `/api/environments/bulk`,
      method: 'POST',
      data
    });
    return response.data;
  };

  const deleteEnvironment = async (id: string) => {
    const response = await apiClient.doRequest({
      url: `/api/environments/${id}`,
      method: 'DELETE'
    });
    return response.data;
  };

  const editEnvironment = async (id: string, data: CreateEnvironmentDTO) => {
    const response = await apiClient.doRequest<EnvironmentDTO>({
      url: `/api/environments/${id}`,
      method: 'PUT',
      data
    });
    return response.data;
  };

  return {
    createEnvironment,
    createEnvironmentsBulk,
    deleteEnvironment,
    editEnvironment,
    getEnvironment
  };
};

export default useEnvironmentsApi;
