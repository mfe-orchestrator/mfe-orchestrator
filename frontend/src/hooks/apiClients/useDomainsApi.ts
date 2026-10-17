import { useTranslation } from "react-i18next"
import useApiClient, { errorCodeOf } from "../useApiClient"

/** A functional domain: a named group of microfrontends and services of the project */
export interface Domain {
    _id: string
    projectId: string
    slug: string
    name: string
    description?: string
    /** Only on the list */
    microfrontendsCount?: number
    /** Only on the list */
    servicesCount?: number
    createdAt?: Date
    updatedAt?: Date
}

export interface DomainDTO {
    name: string
    description?: string
}

/** The codes the backend raises about domains, by translation key */
const DOMAIN_ERROR_KEYS: Record<string, string> = {
    DOMAIN_SLUG_TAKEN: "domains.errors.slug_taken",
    DOMAIN_SLUG_INVALID: "domains.errors.slug_invalid",
    DOMAIN_NAME_REQUIRED: "domains.errors.name_required",
    DOMAIN_INVALID: "domains.errors.invalid",
    DOMAIN_NOT_FOUND: "domains.errors.not_found"
}

const useDomainsApi = () => {
    const apiClient = useApiClient()
    const { t } = useTranslation()

    /** The translated message of a domain error, undefined for any other so the generic one is shown */
    const errorMessage = (error: Error): string | undefined => {
        const key = DOMAIN_ERROR_KEYS[errorCodeOf(error) ?? ""]
        return key ? t(key) : undefined
    }

    const getAll = async (): Promise<Domain[]> => {
        const response = await apiClient.doRequest<Domain[]>({ url: "/api/domains" })
        return response.data
    }

    const getSingle = async (id: string): Promise<Domain> => {
        const response = await apiClient.doRequest<Domain>({ url: `/api/domains/${id}` })
        return response.data
    }

    const create = async (domain: DomainDTO): Promise<Domain> => {
        const response = await apiClient.doRequest<Domain>({ url: "/api/domains", method: "POST", data: domain, customErrorMessage: errorMessage })
        return response.data
    }

    const update = async (id: string, domain: DomainDTO): Promise<Domain> => {
        const response = await apiClient.doRequest<Domain>({ url: `/api/domains/${id}`, method: "PUT", data: domain, customErrorMessage: errorMessage })
        return response.data
    }

    const deleteSingle = async (id: string) => {
        const response = await apiClient.doRequest({ url: `/api/domains/${id}`, method: "DELETE" })
        return response.data
    }

    return { getAll, getSingle, create, update, deleteSingle, errorMessage }
}

export default useDomainsApi
