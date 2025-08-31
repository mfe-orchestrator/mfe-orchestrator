import useApiClient from "../useApiClient";


export interface GlobalVariable{
    key: string;
    value: string;
}

const useGlobalVariablesApi = () =>{

    const apiClient = useApiClient();


      const getGlobalVariablesByProjectId = async (projectId: string): Promise<GlobalVariable[]> => {
        const response = await apiClient.doRequest<GlobalVariable[]>({
          url: `/api/projects/${projectId}/global-variables`,
        });
        return response.data;
      }

    return {
        getGlobalVariablesByProjectId
    }
}
    
export default useGlobalVariablesApi
