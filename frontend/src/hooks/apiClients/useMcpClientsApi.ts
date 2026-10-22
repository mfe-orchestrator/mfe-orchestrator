import { AuthenticationType } from "@/api/apiClient"
import useApiClient from "../useApiClient"

export interface McpClient {
    id: string
    clientName: string
    clientId: string
    registrationType: "dcr" | "cimd"
    userEmail: string
    scopes: string[]
    projects: { id: string; name: string }[]
    createdAt: string
    lastUsedAt?: string
}

const useMcpClientsApi = () => {
    const apiClient = useApiClient()

    const getMcpClients = async (projectId: string): Promise<McpClient[]> => {
        const response = await apiClient.doRequest<McpClient[]>({
            url: `/api/projects/${projectId}/mcp-clients`,
            method: "GET",
            authenticated: AuthenticationType.REQUIRED
        })
        return response.data
    }

    const revokeMcpClient = async (grantId: string): Promise<void> => {
        await apiClient.doRequest({
            url: `/api/mcp-clients/${grantId}`,
            method: "DELETE",
            authenticated: AuthenticationType.REQUIRED
        })
    }

    return { getMcpClients, revokeMcpClient }
}

export default useMcpClientsApi
