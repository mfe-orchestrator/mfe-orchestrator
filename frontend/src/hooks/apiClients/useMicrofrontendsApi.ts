import useApiClient from "../useApiClient"

export enum HostedOn {
    MFE_ORCHESTRATOR_HUB = 'MFE_ORCHESTRATOR_HUB',
    CUSTOM_URL = 'CUSTOM_URL'
  }
  
  export enum CanaryType{
    ON_SESSIONS = 'ON_SESSIONS',
    ON_USER = 'ON_USER',
    COOKIE_BASED = 'COOKIE_BASED'
  }
  
  export enum CanaryDeploymentType{
    BASED_ON_VERSION = 'BASED_ON_VERSION',
    BASED_ON_URL = 'BASED_ON_URL'
  }
  
export interface Microfrontend {
    _id?: string
    slug: string;
    name: string;
    version: string;
    canaryVersion?: string;
    continuousDeployment?: boolean;
    url: string;
    environmentId: string;
    canary?: {
        enabled: boolean;
        percentage: number;
        type: CanaryType;
        deploymentType: CanaryDeploymentType;
        url?: string;
        version?: string;
    };
    host: {
        type: HostedOn;
        url?: string;
    }
    description?: string;
    createdAt: Date;
    updatedAt: Date;
}

const useMicrofrontendsApi = () => {

    const apiClient = useApiClient()

    const getByEnvironmentId = async (environmentId: string) : Promise<Microfrontend[] | undefined> => {
        const response = await apiClient.doRequest<Microfrontend[]>({
            url: `/api/environments/${environmentId}/microfrontends`,
        });
        return response.data;
    };

    const create = async (microfrontend: Microfrontend) => {
        const response = await apiClient.doRequest({
            url: `/api/microfrontends`,
            method: "POST",
            data: microfrontend
        });
        return response.data;
    };

    const update = async (microfrontend: Microfrontend) => {
        const response = await apiClient.doRequest({
            url: `/api/microfrontends/${microfrontend.id}`,
            method: "PUT",
            data: microfrontend
        });
        return response.data;
    };

    const deleteSingle = async (id: string) => {
        const response = await apiClient.doRequest({
            url: `/api/microfrontends/${id}`,
            method: "DELETE"
        });
        return response.data;
    };
    

    return {
        getByEnvironmentId,
        create,
        update,
        deleteSingle
    }
}

export default useMicrofrontendsApi
