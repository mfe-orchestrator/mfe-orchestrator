import useApiClient, { IClientRequestMetadataExtended } from "../useApiClient"

export enum HostedOn {
    MFE_ORCHESTRATOR_HUB = "MFE_ORCHESTRATOR_HUB",
    CUSTOM_URL = "CUSTOM_URL",
    CUSTOM_SOURCE = "CUSTOM_SOURCE"
}

/**
 * How the canary picks who gets the new version. RANDOM and ON_SESSION split traffic by percentage
 * and differ only in whether the draw sticks to the browser; ON_USER ignores the percentage and
 * serves the canary to the users enrolled on the deployment.
 */
export enum CanaryType {
    RANDOM = "RANDOM",
    ON_SESSION = "ON_SESSION",
    ON_USER = "ON_USER"
}

export enum CanaryDeploymentType {
    BASED_ON_VERSION = "BASED_ON_VERSION",
    BASED_ON_URL = "BASED_ON_URL"
}

export interface PositionDTO {
    id: string
    x: number
    y: number
}

export interface DimensionsDTO {
    id: string
    width: number
    height: number
}

export interface RelationDTO {
    remote: string
    host: string
}

export interface Microfrontend {
    _id?: string
    slug: string
    name: string
    version: string
    /** Market slug of the template the microfrontend was created from */
    template?: string
    continuousDeployment?: boolean
    projectId?: string
    /** The functional domain it belongs to; null or missing when it is in none */
    domainId?: string | null
    canary?: {
        enabled: boolean
        percentage: number
        type: CanaryType
        deploymentType: CanaryDeploymentType
        url?: string
        version?: string
    }
    host: {
        type: HostedOn
        url?: string
        storageId?: string
        entryPoint?: string
    }
    codeRepository?: {
        enabled: boolean
        codeRepositoryId: string
        repositoryId: string
        name: string
        cloneUrlHttps?: string
        cloneUrlSsh?: string
        azure?: {
            projectId?: string
        }
        github?: {
            organizationId?: string
            private?: boolean
        }
        gitlab?: {
            groupPath?: string
            groupId?: number
        }
        createData?: {
            template?: string
            name?: string
            private?: boolean
        }
    }
    description?: string
    /** Markdown per gli agenti AI su questo solo microfrontend */
    context?: string
    createdAt?: Date
    updatedAt?: Date
    parentIds?: string[]
    /** Backend services this microfrontend calls, linked by hand */
    serviceIds?: string[]
    position?: {
        x: number
        y: number
        width: number
        height: number
    }
}

const useMicrofrontendsApi = () => {
    const apiClient = useApiClient()

    const getByProjectId = async (projectId: string): Promise<Microfrontend[] | undefined> => {
        const response = await apiClient.doRequest<Microfrontend[]>({
            url: `/api/projects/${projectId}/microfrontends`
        })
        return response.data
    }

    const getSingle = async (id: string): Promise<Microfrontend> => {
        const response = await apiClient.doRequest<Microfrontend>({
            url: `/api/microfrontends/${id}`
        })
        return response.data
    }

    const create = async (microfrontend: Microfrontend, metadata?: IClientRequestMetadataExtended) => {
        const response = await apiClient.doRequest({
            url: `/api/microfrontends`,
            method: "POST",
            data: microfrontend,
            ...metadata
        })
        return response.data
    }

    const update = async (id: string, microfrontend: Microfrontend, metadata?: IClientRequestMetadataExtended) => {
        const response = await apiClient.doRequest({
            url: `/api/microfrontends/${id}`,
            method: "PUT",
            data: microfrontend,
            ...metadata
        })
        return response.data
    }

    const deleteSingle = async (id: string) => {
        const response = await apiClient.doRequest({
            url: `/api/microfrontends/${id}`,
            method: "DELETE"
        })
        return response.data
    }

    const build = async (id: string, version: string, branch: string) => {
        const response = await apiClient.doRequest({
            url: `/api/microfrontends/${id}/build`,
            method: "POST",
            data: { version, branch }
        })
        return response.data
    }

    /** Rinomina il repository git del microfrontend presso il provider: ritorna il microfrontend aggiornato. Gli errori li gestisce il chiamante */
    const renameRepository = async (id: string, name: string): Promise<Microfrontend> => {
        const response = await apiClient.doRequest<Microfrontend>({
            url: `/api/microfrontends/${id}/repository/rename`,
            method: "POST",
            data: { name },
            silent: true
        })
        return response.data
    }

    const getVersions = async (id: string): Promise<string[]> => {
        const response = await apiClient.doRequest<string[]>({
            url: `/api/microfrontends/${id}/versions`
        })
        return response.data
    }

    const setPosition = async (data: PositionDTO) => {
        const { id, ...position } = data
        const response = await apiClient.doRequest({
            url: `/api/microfrontends/${id}/position`,
            method: "PUT",
            data: position
        })
        return response.data
    }

    const setDimensions = async (data: DimensionsDTO) => {
        const { id, ...dimensions } = data
        const response = await apiClient.doRequest({
            url: `/api/microfrontends/${id}/dimensions`,
            method: "PUT",
            data: dimensions
        })
        return response.data
    }

    const setRelation = async (data: RelationDTO) => {
        const response = await apiClient.doRequest({
            url: `/api/microfrontends/relation`,
            method: "PUT",
            data
        })
        return response.data
    }

    const removeRelation = async (data: RelationDTO) => {
        const response = await apiClient.doRequest({
            url: `/api/microfrontends/relation`,
            method: "DELETE",
            data
        })
        return response.data
    }

    const linkService = async (microfrontendId: string, serviceId: string) => {
        const response = await apiClient.doRequest({
            url: `/api/microfrontends/${microfrontendId}/services/${serviceId}`,
            method: "PUT"
        })
        return response.data
    }

    const unlinkService = async (microfrontendId: string, serviceId: string) => {
        const response = await apiClient.doRequest({
            url: `/api/microfrontends/${microfrontendId}/services/${serviceId}`,
            method: "DELETE"
        })
        return response.data
    }

    return {
        getByProjectId,
        create,
        update,
        deleteSingle,
        getSingle,
        build,
        renameRepository,
        getVersions,
        setPosition,
        setDimensions,
        setRelation,
        removeRelation,
        linkService,
        unlinkService
    }
}

export default useMicrofrontendsApi
