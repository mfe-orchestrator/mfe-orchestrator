import { AuthenticationType } from '@/api/apiClient';
import useApiClient from '../useApiClient';

export interface ApiKey {
  _id: string;
  name: string;
  key: string;
  expiresAt: string;
  createdAt: string;
  lastUsedAt?: string;
}

export interface CreateApiKeyDTO {
  name: string;
  expiresAt: string;
}

export interface CreateApiKeyResponseDTO{
  apiKey: string;
}

const useApiKeysApi = () => {
  const apiClient = useApiClient();

  const getApiKeys = async (projectId : string): Promise<ApiKey[]> => {
    const response = await apiClient.doRequest<ApiKey[]>({
      url: `/api/projects/${projectId}/api-keys`,
      method: 'GET',
      authenticated: AuthenticationType.REQUIRED,
    });
    return response.data;
  };

  const createApiKey = async (data: CreateApiKeyDTO): Promise<CreateApiKeyResponseDTO> => {
    const response = await apiClient.doRequest<CreateApiKeyResponseDTO>({
      url: '/api/api-keys',
      method: 'POST',
      data,
      authenticated: AuthenticationType.REQUIRED,
    });
    return response.data;
  };

  const deleteApiKey = async (id: string): Promise<void> => {
    await apiClient.doRequest({
      url: `/api/api-keys/${id}`,
      method: 'DELETE',
      authenticated: AuthenticationType.REQUIRED,
    });
  };

  return {
    getApiKeys,
    createApiKey,
    deleteApiKey,
  };
};

export default useApiKeysApi;
