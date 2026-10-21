import useApiClient from "../useApiClient"
import useGitOpsErrorMessage from "./useGitOpsErrorMessage"
import { GlobalVariable } from "./useGlobalVariablesApi"
import { Microfrontend } from "./useMicrofrontendsApi"

/** A backend service as the deploy recorded it, at the version it shipped */
export interface DeployedService {
    _id: string
    slug: string
    name: string
    domainId?: string | null
    version?: string
    image?: { repository?: string }
}

/** A config map or a secret as the deploy recorded it in its environment: a secret's keys come without values */
export interface DeployedVariableMap {
    _id: string
    name: string
    entries: Array<{ key: string; value?: string }>
}

export interface DeploymentDTO {
    _id: string
    environmentId: string
    microfrontends: Microfrontend[]
    /** Absent from the deployments made before the services were recorded */
    services?: DeployedService[]
    /** Absent from the deployments made before the config maps and secrets were recorded */
    configMaps?: DeployedVariableMap[]
    secrets?: DeployedVariableMap[]
    variables: GlobalVariable[]
    storages: Storage[]
    deploymentId: string
    active: boolean
    createdAt: string
    updatedAt: string
    deployedAt: string
}

const useDeploymentsApi = () => {
    const apiClient = useApiClient()
    // Il deploy fa il commit sul repository GitOps: se fallisce, il deploy non parte
    const customErrorMessage = useGitOpsErrorMessage()

    const getDeployments = async (environmentId: string) => {
        const response = await apiClient.doRequest<DeploymentDTO[]>({
            url: `/api/environments/${environmentId}/deployments`,
            method: "GET"
        })
        return response.data
    }

    /** With `domainId`, only the microfrontends and services of that functional domain move */
    const createDeployment = async (environmentIds: string[], domainId?: string) => {
        const response = await apiClient.doRequest<DeploymentDTO>({
            url: `/api/deployment`,
            method: "POST",
            customErrorMessage,
            data: {
                environmentIds,
                domainId
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

    const getLastDeployment = async (environmentId: string) => {
        const response = await apiClient.doRequest<DeploymentDTO>({
            url: `/api/environments/${environmentId}/deployments/last`,
            method: "GET"
        })
        return response.data
    }

    const redeploy = async (deploymentId: string) => {
        const response = await apiClient.doRequest<DeploymentDTO>({
            url: `/api/deployment/${deploymentId}/redeployment`,
            method: "POST",
            customErrorMessage
        })
        return response.data
    }

    return {
        getDeployments,
        createDeployment,
        getDeployment,
        redeploy,
        getLastDeployment
    }
}

export default useDeploymentsApi
