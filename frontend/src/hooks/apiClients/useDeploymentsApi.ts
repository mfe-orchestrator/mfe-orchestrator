import useApiClient from "../useApiClient"
import { GlobalVariable } from "./useGlobalVariablesApi"
import { Microfrontend } from "./useMicrofrontendsApi"

export interface CanaryUser {
    _id: string
    name: string
    surname: string
    email: string
    isActive: boolean
}

export interface DeploymentDTO {
    _id: string
    environmentId: string
    microfrontends: Microfrontend[]
    variables: GlobalVariable[]
    deploymentId: string
    active: boolean
    createdAt: string
    updatedAt: string
    deployedAt: string
}

interface CreateDeploymentDTO {
    microfrontendId: string
    version: string
    metadata?: Record<string, any>
}

const useDeploymentsApi = () => {
    const apiClient = useApiClient()

    const getDeployments = async (environmentId: string) => {
        const response = await apiClient.doRequest<DeploymentDTO[]>({
            url: `/api/environments/${environmentId}/deployments`,
            method: "GET"
        })
        return response.data
    }

    const createDeployment = async (environmentIds: string[]) => {
        const response = await apiClient.doRequest<DeploymentDTO>({
            url: `/api/deployment`,
            method: "POST",
            data: {
                environmentIds
            }
        })
        return response.data
    }

    const getDeployment = async (environmentId: string, deploymentId: string) => {
        const response = await apiClient.doRequest<DeploymentDTO>({
            url: `/api/environments/${environmentId}/deployments/${deploymentId}`,
            method: "GET"
        })
        return response.data
    }

    const redeploy = async (deploymentId: string) => {
        const response = await apiClient.doRequest<DeploymentDTO>({
            url: `/api/deployment/${deploymentId}/redeployment`,
            method: "POST"
        })
        return response.data
    }

    const getCanaryUsers = async (deploymentId: string) => {
        const response = await apiClient.doRequest<CanaryUser[]>({
            url: `/api/deployments/${deploymentId}/canary-users`,
            method: "GET"
        })
        return response.data
    }

    return {
        getDeployments,
        createDeployment,
        getDeployment,
        redeploy,
        getCanaryUsers
    }
}

export default useDeploymentsApi
