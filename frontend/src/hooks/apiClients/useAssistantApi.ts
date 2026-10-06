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

const useAssistantApi = () => {
    const apiClient = useApiClient()

    /** A draft of a new project from a free-text description. The chat itself streams, see useAssistantChat. */
    const draftProject = async (description: string, locale: string): Promise<ProjectDraft> => {
        const response = await apiClient.doRequest<ProjectDraft>({
            url: "/api/assistant/project-draft",
            method: "POST",
            data: { description, locale },
            silent: true
        })
        return response.data
    }

    return { draftProject }
}

export default useAssistantApi
