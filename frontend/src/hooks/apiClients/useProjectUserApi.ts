import { AuthenticationType } from "@/api/apiClient"
import useApiClient from "@/hooks/useApiClient"

export interface ProjectUser {
    _id: string
    email: string
    name?: string
    surname?: string
    role: string
    status?: string
    invitationPending?: boolean
    invitationExpiresAt?: string
    createdAt: string
    updatedAt: string
}

const useProjectUserApi = () => {
    const apiClient = useApiClient()

    const getProjectUsers = async (projectId: string): Promise<ProjectUser[]> => {
        const response = await apiClient.doRequest<ProjectUser[]>({
            url: `/api/projects/${projectId}/users`,
            method: "GET",
            authenticated: AuthenticationType.REQUIRED
        })
        return response.data
    }

    const removeUserFromProject = async (projectId: string, userId: string): Promise<void> => {
        await apiClient.doRequest({
            url: `/api/projects/${projectId}/users/${userId}`,
            method: "DELETE",
            authenticated: AuthenticationType.REQUIRED
        })
    }

    const resendInvitation = async (projectId: string, userId: string): Promise<void> => {
        await apiClient.doRequest({
            url: `/api/projects/${projectId}/users/${userId}/resend-invitation`,
            method: "POST",
            authenticated: AuthenticationType.REQUIRED
        })
    }

    return {
        getProjectUsers,
        removeUserFromProject,
        resendInvitation
    }
}

export default useProjectUserApi
