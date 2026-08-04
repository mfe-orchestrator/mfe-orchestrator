import { AuthenticationType } from "@/api/apiClient"
import useApiClient from "@/hooks/useApiClient"
import { User } from "./useUserApi"

export interface InvitationInfo {
    projectName: string
    role: string
    email: string
    needsPassword: boolean
}

export interface AcceptInvitationDTO {
    password?: string
    name?: string
    surname?: string
}

export interface AcceptInvitationResponse {
    accessToken: string
    user: User
}

const useInvitationApi = () => {
    const { doRequest } = useApiClient()

    const getInvitation = async (token: string): Promise<InvitationInfo> => {
        const response = await doRequest<InvitationInfo>({
            url: `/api/projects/invitations/${token}`,
            method: "GET",
            authenticated: AuthenticationType.NONE
        })
        return response.data
    }

    const acceptInvitation = async (token: string, data: AcceptInvitationDTO): Promise<AcceptInvitationResponse> => {
        const response = await doRequest<AcceptInvitationResponse>({
            url: `/api/projects/invitations/${token}/accept`,
            method: "POST",
            authenticated: AuthenticationType.NONE,
            data
        })
        return response.data
    }

    return {
        getInvitation,
        acceptInvitation
    }
}

export default useInvitationApi
