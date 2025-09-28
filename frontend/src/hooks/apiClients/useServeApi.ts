import { AuthenticationType } from "@/api/apiClient";
import useApiClient from "../useApiClient";
import { GlobalVariable } from "./useGlobalVariablesApi";

export interface IServeMicrofrontend {
    url: string,
    slug: string,
    continuousDevelopment: boolean,    
}

export interface IServe {
    globalVariables: GlobalVariable[],
    microfrontends: IServeMicrofrontend[]
}

const useServeApi = () => {

    const apiClient = useApiClient();

    const getAll = async (environmentId : string) : Promise<IServe>=>{
        console.log('environmentId', environmentId);
        const response = await apiClient.doRequest<IServe>({
            url: '/api/serve/all/'+environmentId,
            method: 'GET',
            authenticated: AuthenticationType.NONE,
        });
        return response.data;
    }


    return {
        getAll
    }
    
}

export default useServeApi;
