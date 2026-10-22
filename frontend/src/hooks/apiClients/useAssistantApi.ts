import { AssistantMessage } from "@/store/useAssistantStore"
import useApiClient from "../useApiClient"

export interface ProjectDraft {
    name: string
    description: string
    environments: {
        name: string
        slug: string
        isProduction: boolean
        color: string
    }[]
    storage: "NONE" | "AWS_S3" | "GOOGLE_CLOUD_STORAGE" | "AZURE_BLOB_STORAGE"
    codeRepository: "NONE" | "GITHUB" | "GITLAB" | "AZURE_DEV_OPS"
    notes: string
}

/** An entry of the assistant's history on the project open in the console. */
export interface AssistantConversationSummary {
    id: string
    title: string
    updatedAt: string
}

export interface AssistantConversation extends AssistantConversationSummary {
    messages: AssistantMessage[]
}

const useAssistantApi = () => {
    const apiClient = useApiClient()

    /**
     * A draft of a new project from a free-text description, with an AI of `organizationId`, the organization the
     * project will belong to. The chat itself streams, see useAssistantChat.
     */
    const draftProject = async (description: string, locale: string, organizationId: string, aiModelId?: string): Promise<ProjectDraft> => {
        const response = await apiClient.doRequest<ProjectDraft>({
            url: "/api/assistant/project-draft",
            method: "POST",
            data: { description, locale, organizationId, aiModelId },
            silent: true
        })
        return response.data
    }

    /** The user's conversations on the current project, most recent first. */
    const listConversations = async (): Promise<AssistantConversationSummary[]> => {
        const response = await apiClient.doRequest<AssistantConversationSummary[]>({ url: "/api/assistant/conversations" })
        return response.data
    }

    const getConversation = async (id: string): Promise<AssistantConversation> => {
        const response = await apiClient.doRequest<AssistantConversation>({ url: `/api/assistant/conversations/${id}` })
        return response.data
    }

    /** Silent: the answer is already on screen, a failed save only costs it its place in the history. */
    const saveConversation = async (id: string, messages: AssistantMessage[]): Promise<void> => {
        await apiClient.doRequest<void, { messages: AssistantMessage[] }>({
            url: `/api/assistant/conversations/${id}`,
            method: "PUT",
            data: { messages },
            silent: true
        })
    }

    const deleteConversation = async (id: string): Promise<void> => {
        await apiClient.doRequest<void>({ url: `/api/assistant/conversations/${id}`, method: "DELETE" })
    }

    return { draftProject, listConversations, getConversation, saveConversation, deleteConversation }
}

export default useAssistantApi
