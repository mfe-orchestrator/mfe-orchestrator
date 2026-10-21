import useApiClient, { IClientRequestMetadataExtended } from "../useApiClient"
import type { CreateMemberRepositoryDTO, Microfrontend } from "./useMicrofrontendsApi"

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

/** Where the service answers in one environment: the base its docs and OpenAPI paths are relative to */
export interface ServiceUrl {
    environmentId: string
    url: string
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
    /** Il path su cui e' esposto sull'host di ogni ambiente, es. /api/orders; null se non e' esposto */
    exposurePath?: string | null
    /** The OpenAPI spec; blank or null when the service has none */
    openApiPath?: string | null
    /** One per environment it is exposed in; an environment left out has no known address */
    urls?: ServiceUrl[]
    env: ServiceEnvVariable[]
    /** Config maps of the project it receives as environment variables */
    configMapIds?: string[]
    /** Secrets of the project it receives as environment variables */
    secretIds?: string[]
    createdAt?: Date
    updatedAt?: Date
}

export type ServiceDTO = Omit<Service, "_id" | "projectId" | "stack" | "version" | "createdAt" | "updatedAt">

/** Port and probe paths left out come from the template, the platform defaults after it. */
export type ServiceCreateDTO = Omit<ServiceDTO, "port" | "livenessPath" | "readinessPath"> & Partial<Pick<ServiceDTO, "port" | "livenessPath" | "readinessPath">>

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

    const create = async (service: ServiceCreateDTO, metadata?: IClientRequestMetadataExtended): Promise<Service> => {
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

    const createRepository = async (id: string, data: CreateMemberRepositoryDTO, metadata?: IClientRequestMetadataExtended): Promise<Service> => {
        const response = await apiClient.doRequest<Service>({ url: `/api/services/${id}/repository`, method: "POST", data, ...metadata })
        return response.data
    }

    return { getAll, getSingle, getVersions, create, update, deleteSingle, build, createRepository }
}

export default useServicesApi
