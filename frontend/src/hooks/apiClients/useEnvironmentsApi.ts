import useApiClient from "../useApiClient"
import useGitOpsErrorMessage from "./useGitOpsErrorMessage"

export interface EnvironmentDTO {
    slug: string
    name: string
    description?: string
    order?: number
    createdAt?: string
    updatedAt?: string
    color?: string
    isProduction?: boolean
    domains?: string[]
    /** Namespace Kubernetes in cui GitOps fa il commit dell'ambiente; se vuoto e' lo slug in minuscolo */
    namespace?: string
    /** Sotto cosa e' esposto sul dominio del progetto, es. `dev`; se vuoto, sul dominio stesso */
    subdomain?: string
    _id?: string
}

export interface CreateEnvironmentDTO {
    name: string
    slug: string
    isProduction?: boolean
    color?: string
    domains?: string[]
    namespace?: string
    subdomain?: string
}

const useEnvironmentsApi = () => {
    const apiClient = useApiClient()
    // Creare, rinominare o eliminare un ambiente riallinea il repository GitOps, quando e' attivo
    const customErrorMessage = useGitOpsErrorMessage()

    const getEnvironment = async (id: string) => {
        const response = await apiClient.doRequest<EnvironmentDTO>({
            url: `/api/environments/${id}`
        })
        return response.data
    }

    const createEnvironment = async (data: CreateEnvironmentDTO) => {
        const response = await apiClient.doRequest<EnvironmentDTO>({
            url: `/api/environments`,
            method: "POST",
            customErrorMessage,
            data
        })
        return response.data
    }

    const createEnvironmentsBulk = async (data: CreateEnvironmentDTO[]) => {
        const response = await apiClient.doRequest<EnvironmentDTO[]>({
            url: `/api/environments/bulk`,
            method: "POST",
            customErrorMessage,
            data
        })
        return response.data
    }

    const deleteEnvironment = async (id: string) => {
        const response = await apiClient.doRequest({
            url: `/api/environments/${id}`,
            method: "DELETE",
            customErrorMessage
        })
        return response.data
    }

    /**
     * Persists the environments order: the position of each id inside the array becomes its order
     */
    const updateEnvironmentsOrder = async (ids: string[]) => {
        const response = await apiClient.doRequest<EnvironmentDTO[]>({
            url: `/api/environments/order`,
            method: "PUT",
            data: { ids }
        })
        return response.data
    }

    const editEnvironment = async (id: string, data: CreateEnvironmentDTO) => {
        const response = await apiClient.doRequest<EnvironmentDTO>({
            url: `/api/environments/${id}`,
            method: "PUT",
            customErrorMessage,
            data
        })
        return response.data
    }

    return {
        createEnvironment,
        createEnvironmentsBulk,
        deleteEnvironment,
        editEnvironment,
        getEnvironment,
        updateEnvironmentsOrder
    }
}

export default useEnvironmentsApi
