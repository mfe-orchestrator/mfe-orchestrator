import { useTranslation } from "react-i18next"
import useApiClient, { errorCodeOf, IClientRequestMetadataExtended } from "../useApiClient"

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

/**
 * How it is served. A MICROFRONTEND is a static bundle served by MFE Orchestrator; a FRONTEND is an app
 * built into a Docker image and served by its own container. Chosen by hand only: neither the template
 * nor the host/remote role sets it.
 */
export enum MicrofrontendKind {
    MICROFRONTEND = "MICROFRONTEND",
    FRONTEND = "FRONTEND"
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
    /** Missing on a FRONTEND until its pipeline registers the first version */
    version?: string
    /** Missing on the ones saved before it existed: those are a MICROFRONTEND */
    kind?: MicrofrontendKind
    /** A FRONTEND's Docker image: the repository its pipeline pushes to */
    image?: {
        repository?: string
    }
    /** Market slug of the template the microfrontend was created from */
    template?: string
    continuousDeployment?: boolean
    projectId?: string
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
            /** Full path of the repository on GitLab, written by the backend when it creates or renames it */
            path?: string
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
    position?: {
        x: number
        y: number
        width: number
        height: number
    }
}

/** A registered version. A FRONTEND's carries the image its pipeline published. */
export interface BuiltFrontend {
    _id?: string
    microfrontendId: string
    version: string
    /** Full image reference, e.g. ghcr.io/acme/shell:1.2.0 */
    image?: string
    digest?: string
    commitSha?: string
    createdAt?: Date
    updatedAt?: Date
}

/** The codes the backend raises about the kind of a microfrontend, by translation key */
const MICROFRONTEND_ERROR_KEYS: Record<string, string> = {
    FRONTEND_CANNOT_HAVE_PARENTS: "microfrontend.errors.frontend_cannot_have_parents",
    FRONTEND_UPLOAD_NOT_ALLOWED: "microfrontend.errors.frontend_upload_not_allowed",
    MICROFRONTEND_VERSION_REGISTRATION_NOT_ALLOWED: "microfrontend.errors.version_registration_not_allowed"
}

const useMicrofrontendsApi = () => {
    const apiClient = useApiClient()
    const { t } = useTranslation()

    /** The translated message of a kind error, undefined for any other so the generic one is shown */
    const errorMessage = (error: Error): string | undefined => {
        const key = MICROFRONTEND_ERROR_KEYS[errorCodeOf(error) ?? ""]
        return key ? t(key) : undefined
    }

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

    /** Without a host the backend serves it from the project's default hosting. */
    const create = async (microfrontend: Omit<Microfrontend, "host"> & { host?: Microfrontend["host"] }, metadata?: IClientRequestMetadataExtended) => {
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

    /** The registered versions with their image, digest and commit: what a FRONTEND's pipeline published */
    const getBuilds = async (id: string): Promise<BuiltFrontend[]> => {
        const response = await apiClient.doRequest<BuiltFrontend[]>({
            url: `/api/microfrontends/${id}/builds`
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
            url: `/api/microfrontends/${id}/dimension`,
            method: "PUT",
            data: dimensions
        })
        return response.data
    }

    const setRelation = async (data: RelationDTO) => {
        const response = await apiClient.doRequest({
            url: `/api/microfrontends/relation`,
            method: "PUT",
            data,
            customErrorMessage: errorMessage
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

    return {
        errorMessage,
        getByProjectId,
        create,
        update,
        deleteSingle,
        getSingle,
        build,
        renameRepository,
        getVersions,
        getBuilds,
        setPosition,
        setDimensions,
        setRelation,
        removeRelation
    }
}

export default useMicrofrontendsApi
