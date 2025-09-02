import useApiClient from "../useApiClient";

export interface EnvironmentValue {
    environmentId: string;
    value: string;
}

export interface GlobalVariable {
    _id: string;
    key: string;
    value: string;
    environmentId: string;
}

export interface GlobalVariableCreateDTO {
    key: string;
    values: EnvironmentValue[];
}

export interface GlobalVariableUpdateDTO {
    originalKey: string;
    key: string;
    values: EnvironmentValue[];
}

interface CreateGlobalVariableDto {
    key: string;
    value: string;
    environmentId: string;
}

const useGlobalVariablesApi = () => {
    const apiClient = useApiClient();

    const getGlobalVariablesByProjectId = async (projectId: string): Promise<GlobalVariable[]> => {
        const response = await apiClient.doRequest<GlobalVariable[]>({
            url: `/api/projects/${projectId}/global-variables`,
        });
        return response.data;
    };

    const create = async (data: GlobalVariableCreateDTO): Promise<void> => {
        await apiClient.doRequest<void>({
            url: `/api/global-variables`,
            method: 'POST',
            data
        });
    };

    const update = async (data: GlobalVariableUpdateDTO): Promise<void> => {
        await apiClient.doRequest<void>({
            url: `/api/global-variables`,
            method: 'PUT',
            data
        });
    };

    const deleteSingle = async (key: string): Promise<void> => {
        await apiClient.doRequest({
            url: `/api/global-variables`,
            method: 'DELETE',
            data: { key }
        });
    };

    return {
        getGlobalVariablesByProjectId,
        create,
        update,
        deleteSingle
    };
};

export default useGlobalVariablesApi;
