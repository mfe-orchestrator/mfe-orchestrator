import useApiClient, { IClientRequestMetadataExtended } from "../useApiClient"
import type { Microfrontend } from "./useMicrofrontendsApi"

export enum ServiceRuntime {
    NODE = "NODE",
    PYTHON = "PYTHON",
    GO = "GO",
    DOTNET = "DOTNET",
    JAVA = "JAVA",
    OTHER = "OTHER"
}

export interface ServiceEnvVariable {
    name: string
    required: boolean
    secret: boolean
    description?: string
}

/** A key of the config map or of the secrets with its value per environment; an environment left out leaves it unset there */
export interface ServiceVariable {
    key: string
    /** For the secrets, the API sends a placeholder in place of every value, and sending it back keeps the stored one */
    values: { environmentId: string; value: string }[]
}

/** Same shape as the microfrontend repository link: the backend reuses the subdocument. */
export type ServiceCodeRepository = Microfrontend["codeRepository"]

export interface Service {
    _id?: string
    projectId?: string
    /** The functional domain it belongs to; null or missing when it is in none */
    domainId?: string | null
    slug: string
    name: string
    description?: string
    /** Markdown per gli agenti AI su questo solo servizio */
    context?: string
    /** Market slug of the template the service was created from */
    template?: string
    stack?: {
        runtime?: ServiceRuntime
        framework?: string
        source?: string
        detectedAt?: Date
    }
    /** Latest registered version */
    version?: string
    codeRepository?: ServiceCodeRepository
    image?: {
        repository?: string
    }
    port: number
    /** Kubernetes restarts the container when it fails */
    livenessPath: string
    /** Kubernetes sends traffic only while it answers */
    readinessPath: string
    /** The UI of the public API documentation; blank or null when the service has none */
    docsPath?: string | null
    /** The OpenAPI spec; blank or null when the service has none */
    openApiPath?: string | null
    env: ServiceEnvVariable[]
    configMap?: ServiceVariable[]
    secrets?: ServiceVariable[]
    createdAt?: Date
    updatedAt?: Date
}

export type ServiceDTO = Omit<Service, "_id" | "projectId" | "stack" | "version" | "createdAt" | "updatedAt">

export interface BuiltService {
    _id?: string
    serviceId: string
    version: string
    /** Full image reference, e.g. ghcr.io/acme/orders-api:1.2.0 */
    image: string
    digest?: string
    commitSha?: string
    createdAt?: Date
    updatedAt?: Date
}

const useServicesApi = () => {
    const apiClient = useApiClient()

    const getAll = async (): Promise<Service[]> => {
        const response = await apiClient.doRequest<Service[]>({ url: "/api/services" })
        return response.data
    }

    const getSingle = async (id: string): Promise<Service> => {
        const response = await apiClient.doRequest<Service>({ url: `/api/services/${id}` })
        return response.data
    }

    const getVersions = async (id: string): Promise<BuiltService[]> => {
        const response = await apiClient.doRequest<BuiltService[]>({ url: `/api/services/${id}/versions` })
        return response.data
    }

    const create = async (service: ServiceDTO, metadata?: IClientRequestMetadataExtended): Promise<Service> => {
        const response = await apiClient.doRequest<Service>({ url: "/api/services", method: "POST", data: service, ...metadata })
        return response.data
    }

    const update = async (id: string, service: ServiceDTO, metadata?: IClientRequestMetadataExtended): Promise<Service> => {
        const response = await apiClient.doRequest<Service>({ url: `/api/services/${id}`, method: "PUT", data: service, ...metadata })
        return response.data
    }

    const deleteSingle = async (id: string) => {
        const response = await apiClient.doRequest({ url: `/api/services/${id}`, method: "DELETE" })
        return response.data
    }

    const build = async (id: string, version: string, branch?: string) => {
        const response = await apiClient.doRequest({ url: `/api/services/${id}/build`, method: "POST", data: { version, branch } })
        return response.data
    }

    return { getAll, getSingle, getVersions, create, update, deleteSingle, build }
}

export default useServicesApi
