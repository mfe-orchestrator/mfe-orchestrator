import useApiClient from "../useApiClient"

export enum HostedOn {
    MFE_ORCHESTRATOR_HUB = 'MFE_ORCHESTRATOR_HUB',
    CUSTOM_URL = 'CUSTOM_URL',
    CUSTOM_SOURCE = 'CUSTOM_SOURCE'
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
    continuousDeployment?: boolean;
    projectId?: string
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
        storageId?: string
    }
    description?: string;
    createdAt?: Date;
    updatedAt?: Date;
}

const useMicrofrontendsApi = () => {

    const apiClient = useApiClient()

    const getByProjectId = async (projectId: string) : Promise<Microfrontend[] | undefined> => {
        const response = await apiClient.doRequest<Microfrontend[]>({
            url: `/api/projects/${projectId}/microfrontends`,
        });
        return response.data;
    };

    const getSingle = async(id : string) : Promise<Microfrontend> =>{
        const response = await apiClient.doRequest<Microfrontend>({
            url: `/api/microfrontends/${id}`,
        });
        return response.data;
    }

    const create = async (microfrontend: Microfrontend) => {
        const response = await apiClient.doRequest({
            url: `/api/microfrontends`,
            method: "POST",
            data: microfrontend
        });
        return response.data;
    };

    const update = async (id: string, microfrontend: Microfrontend) => {
        const response = await apiClient.doRequest({
            url: `/api/microfrontends/${id}`,
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
        getByProjectId,
        create,
        update,
        deleteSingle,
        getSingle
    }
}

export default useMicrofrontendsApi
