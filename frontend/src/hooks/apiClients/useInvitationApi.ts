import { AuthenticationType } from "@/api/apiClient"
import useApiClient from "@/hooks/useApiClient"
import { RoleInOrganization } from "./useOrganizationApi"
import { RoleInProject } from "./useProjectApi"
import { User } from "./useUserApi"

export interface InvitationInfo {
    projectName: string
    role: string
    email: string
    needsPassword: boolean
}

/** An invitation addressed to the signed-in user that has not been answered yet. */
export interface PendingInvitation {
    projectId: string
    projectName: string
    projectDescription?: string
    /** Which organization the project sits in: accepting has to take the user there. */
    organizationId: string
    organizationName?: string
    role: RoleInProject
    invitedAt: string
    expiresAt?: string
}

/** The organization counterpart: an invitation to the tenant itself, with no project attached yet. */
export interface PendingOrganizationInvitation {
    organizationId: string
    organizationName: string
    organizationDescription?: string
    role: RoleInOrganization
    invitedAt: string
    expiresAt?: string
}

export interface OrganizationInvitationInfo {
    organizationName: string
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

    /** In-app counterpart of the emailed link: the signed-in user answers the invitations addressed to them. */
    const getMyInvitations = async (): Promise<PendingInvitation[]> => {
        const response = await doRequest<PendingInvitation[]>({
            url: "/api/users/me/invitations",
            // Loaded in the background next to the project list: a failure must not raise a toast on its own
            silent: true
        })
        return response.data
    }

    const acceptMyInvitation = async (projectId: string): Promise<void> => {
        await doRequest({
            url: `/api/users/me/invitations/${projectId}/accept`,
            method: "POST"
        })
    }

    const declineMyInvitation = async (projectId: string): Promise<void> => {
        await doRequest({
            url: `/api/users/me/invitations/${projectId}`,
            method: "DELETE"
        })
    }

    const getOrganizationInvitation = async (token: string): Promise<OrganizationInvitationInfo> => {
        const response = await doRequest<OrganizationInvitationInfo>({
            url: `/api/organizations/invitations/${token}`,
            method: "GET",
            authenticated: AuthenticationType.NONE
        })
        return response.data
    }

    const acceptOrganizationInvitation = async (token: string, data: AcceptInvitationDTO): Promise<AcceptInvitationResponse> => {
        const response = await doRequest<AcceptInvitationResponse>({
            url: `/api/organizations/invitations/${token}/accept`,
            method: "POST",
            authenticated: AuthenticationType.NONE,
            data
        })
        return response.data
    }

    const getMyOrganizationInvitations = async (): Promise<PendingOrganizationInvitation[]> => {
        const response = await doRequest<PendingOrganizationInvitation[]>({
            url: "/api/users/me/organization-invitations",
            // Loaded in the background next to the organization list: a failure must not raise a toast on its own
            silent: true
        })
        return response.data
    }

    const acceptMyOrganizationInvitation = async (organizationId: string): Promise<void> => {
        await doRequest({
            url: `/api/users/me/organization-invitations/${organizationId}/accept`,
            method: "POST"
        })
    }

    const declineMyOrganizationInvitation = async (organizationId: string): Promise<void> => {
        await doRequest({
            url: `/api/users/me/organization-invitations/${organizationId}`,
            method: "DELETE"
        })
    }

    return {
        getInvitation,
        acceptInvitation,
        getMyInvitations,
        acceptMyInvitation,
        declineMyInvitation,
        getOrganizationInvitation,
        acceptOrganizationInvitation,
        getMyOrganizationInvitations,
        acceptMyOrganizationInvitation,
        declineMyOrganizationInvitation
    }
}

export default useInvitationApi
