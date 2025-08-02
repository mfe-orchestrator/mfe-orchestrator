import useApiClient from "../useApiClient"

export interface Microfrontend {
    id: string;
    name: string;
    version: string;
    description: string;
    status: string;
    lastUpdated: string;
    parameters: Record<string, string>;
    environmentVariables: Record<string, string>;
    canaryPercentage: number;
    environmentId: string;
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
