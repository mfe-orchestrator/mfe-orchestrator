import useApiClient from "../useApiClient"

/**
 * One enrolment row of a deployment.
 *
 * `userId` is the identifier of a user of the *host application*, the one it passes to the client SDK
 * as `userId` and the SDK sends as `mfeUserId` — not a user of this console. It is an opaque string,
 * so the console can only ever show it back.
 */
export interface CanaryUser {
    _id: string
    deploymentId: string
    microfrontendId?: string
    userId: string
    enabled: boolean
    createdAt?: string
    updatedAt?: string
}

const useCanaryUsersApi = () => {
    const apiClient = useApiClient()

    const getCanaryUsers = async (deploymentId: string) => {
        return (await apiClient.doRequest<CanaryUser[]>({ url: `/api/deployment/${deploymentId}/canary-users` })).data
    }

    /** Creates the rows that are missing and flips the ones already there, so it doubles as the toggle. */
    const setCanaryUsers = async (deploymentId: string, userIds: string[], enabled: boolean) => {
        return (
            await apiClient.doRequest<CanaryUser[]>({
                url: `/api/deployment/${deploymentId}/canary-users`,
                method: "POST",
                data: { userIds, enabled }
            })
        ).data
    }

    const deleteCanaryUsers = async (deploymentId: string, userIds: string[]) => {
        return (
            await apiClient.doRequest<void>({
                url: `/api/deployment/${deploymentId}/canary-users`,
                method: "DELETE",
                data: userIds
            })
        ).data
    }

    return {
        getCanaryUsers,
        setCanaryUsers,
        deleteCanaryUsers
    }
}

export default useCanaryUsersApi
