import { useTranslation } from "react-i18next"
import useApiClient, { errorCodeOf } from "../useApiClient"

/** A relation drawn by hand from one functional domain of the project to another */
export interface DomainLink {
    _id: string
    projectId: string
    sourceDomainId: string
    targetDomainId: string
    /** What the relation is, e.g. "uses" */
    label?: string
}

export interface DomainLinkDTO {
    sourceDomainId: string
    targetDomainId: string
    label?: string
}

/** The codes the backend raises about domain links, by translation key */
const DOMAIN_LINK_ERROR_KEYS: Record<string, string> = {
    DOMAIN_LINK_EXISTS: "domains.galaxy.errors.link_exists",
    DOMAIN_LINK_INVALID: "domains.galaxy.errors.link_invalid",
    DOMAIN_NOT_FOUND: "domains.errors.not_found"
}

const useDomainLinksApi = () => {
    const apiClient = useApiClient()
    const { t } = useTranslation()

    /** The translated message of a link error, undefined for any other so the generic one is shown */
    const errorMessage = (error: Error): string | undefined => {
        const key = DOMAIN_LINK_ERROR_KEYS[errorCodeOf(error) ?? ""]
        return key ? t(key) : undefined
    }

    const getAll = async (): Promise<DomainLink[]> => {
        const response = await apiClient.doRequest<DomainLink[]>({ url: "/api/domain-links" })
        return response.data
    }

    const create = async (link: DomainLinkDTO): Promise<DomainLink> => {
        const response = await apiClient.doRequest<DomainLink>({ url: "/api/domain-links", method: "POST", data: link, customErrorMessage: errorMessage })
        return response.data
    }

    const deleteSingle = async (id: string) => {
        const response = await apiClient.doRequest({ url: `/api/domain-links/${id}`, method: "DELETE" })
        return response.data
    }

    return { getAll, create, deleteSingle }
}

export default useDomainLinksApi
