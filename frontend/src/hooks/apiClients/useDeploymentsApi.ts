import useApiClient from "../useApiClient";

export interface DeploymentDTO {
  _id: string;
  environmentId: string;
  microfrontendId: string;
  version: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
  deployedAt?: string;
  deployedBy?: string;
  metadata?: Record<string, any>;
}

interface CreateDeploymentDTO {
  microfrontendId: string;
  version: string;
  metadata?: Record<string, any>;
}

const useDeploymentsApi = () => {
  const apiClient = useApiClient();

  const getDeployments = async (environmentId: string) => {
    const response = await apiClient.doRequest<DeploymentDTO[]>({
      url: `/api/environments/${environmentId}/deployments`,
      method: 'GET',
    });
    return response.data;
  };

  const createDeployment = async (environmentId: string, data: CreateDeploymentDTO) => {
    const response = await apiClient.doRequest<DeploymentDTO>({
      url: `/api/environments/${environmentId}/deployments`,
      method: 'POST',
      data,
    });
    return response.data;
  };

  const getDeployment = async (environmentId: string, deploymentId: string) => {
    const response = await apiClient.doRequest<DeploymentDTO>({
      url: `/api/environments/${environmentId}/deployments/${deploymentId}`,
      method: 'GET',
    });
    return response.data;
  };

  return {
    getDeployments,
    createDeployment,
    getDeployment,
  };
};

export default useDeploymentsApi;
