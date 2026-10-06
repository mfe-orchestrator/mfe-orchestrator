import { AuthenticationType } from "@/api/apiClient"
import useApiClient from "../useApiClient"

export type OAuthScope = "mfe:read" | "mfe:write"
export type OAuthClientWarning = "unverified" | "localhost" | "custom_scheme" | "redirect_host_mismatch"

export interface OAuthRequestDetails {
    client: {
        name: string
        registrationType: "dcr" | "cimd"
        redirectHost: string
        clientIdHost: string | null
        warnings: OAuthClientWarning[]
    }
    scopes: string[]
    projects: { id: string; name: string; organizationName: string; role: string }[]
    user: { email: string }
}

export interface OAuthDecisionResponse {
    redirectTo: string
}

const useOAuthApi = () => {
    const apiClient = useApiClient()

    const getRequest = async (handle: string): Promise<OAuthRequestDetails> => {
        const response = await apiClient.doRequest<OAuthRequestDetails>({
            url: `/api/oauth/requests/${encodeURIComponent(handle)}`,
            method: "GET",
            authenticated: AuthenticationType.REQUIRED,
            silent: true
        })
        return response.data
    }

    const approve = async (handle: string, data: { projectId: string; scopes: OAuthScope[] }): Promise<OAuthDecisionResponse> => {
        const response = await apiClient.doRequest<OAuthDecisionResponse>({
            url: `/api/oauth/requests/${encodeURIComponent(handle)}/approve`,
            method: "POST",
            data,
            authenticated: AuthenticationType.REQUIRED
        })
        return response.data
    }

    const deny = async (handle: string): Promise<OAuthDecisionResponse> => {
        const response = await apiClient.doRequest<OAuthDecisionResponse>({
            url: `/api/oauth/requests/${encodeURIComponent(handle)}/deny`,
            method: "POST",
            authenticated: AuthenticationType.REQUIRED
        })
        return response.data
    }

    return { getRequest, approve, deny }
}

export default useOAuthApi
