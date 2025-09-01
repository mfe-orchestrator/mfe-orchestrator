import { url } from "inspector";
import useApiClient from "../useApiClient"

export interface CanaryUser {
    _id: string;
    name: string;
    surname: string;
    email: string;
    isActive: boolean;
}

const useCanaryUsersApi = () => {

    const apiClient = useApiClient()

    const getCanaryUsers = async (deploymentId: string) => {
        return (await apiClient.doRequest<CanaryUser[]>({url: `/api/deployment/${deploymentId}/canary-users`})).data
    }

    return {
        getCanaryUsers
    }

}

export default useCanaryUsersApi