import useApiClient, { IClientRequestMetadataExtended } from "../useApiClient"

export type AiChangeStatus = "PENDING" | "RUNNING" | "PROPOSED" | "APPLYING" | "APPLIED" | "DISCARDED" | "FAILED"

/** Statuses in which the backend is still working on the request: the page polls while one of these holds. */
export const AI_CHANGE_ACTIVE_STATUSES: AiChangeStatus[] = ["PENDING", "RUNNING", "APPLYING"]

export interface AiChangeFile {
    path: string
    action: "create" | "update" | "delete"
    baseBlobOid?: string
    /** Missing on the list endpoint, and on big files even in the full request. */
    originalContent?: string
    proposedContent?: string
}

export interface AiChangeEvent {
    at: string
    /** `info` carries a machine code, `tool` a tool call, `text` what the model said. */
    kind: "info" | "tool" | "text"
    message: string
}

export interface AiChangeRequest {
    _id: string
    projectId: string
    microfrontendId: string
    userId: string
    prompt: string
    baseBranch: string
    baseCommit?: string
    status: AiChangeStatus
    files: AiChangeFile[]
    summary?: string
    /** Missing on the list endpoint. */
    events?: AiChangeEvent[]
    branch?: string
    commit?: string
    pullRequestUrl?: string
    pullRequestError?: string
    error?: string
    /** The job that made the request: one run of the agent, possibly over several repositories. */
    jobId?: string
    /** The proposal this one starts from, when the job was a follow-up. */
    parentId?: string
    /** How many repositories the job works on: above one, its cost is shared with the other requests. */
    jobRepositoryCount?: number
    /** The cost of the whole job, the same on each of its requests; updated while the agent works. */
    usage: { inputTokens: number; cachedInputTokens?: number; outputTokens: number }
    createdAt: string
    updatedAt: string
}

export interface CreateAiChangeDTO {
    prompt: string
    baseBranch?: string
}

const useAiChangesApi = () => {
    const apiClient = useApiClient()

    const create = async (microfrontendId: string, data: CreateAiChangeDTO, metadata?: IClientRequestMetadataExtended): Promise<AiChangeRequest> => {
        const response = await apiClient.doRequest<AiChangeRequest, CreateAiChangeDTO>({
            url: `/api/microfrontends/${microfrontendId}/ai-changes`,
            method: "POST",
            data,
            ...metadata
        })
        return response.data
    }

    const getByMicrofrontendId = async (microfrontendId: string): Promise<AiChangeRequest[]> => {
        const response = await apiClient.doRequest<AiChangeRequest[]>({
            url: `/api/microfrontends/${microfrontendId}/ai-changes`
        })
        return response.data
    }

    const getSingle = async (id: string): Promise<AiChangeRequest> => {
        const response = await apiClient.doRequest<AiChangeRequest>({
            url: `/api/ai-changes/${id}`
        })
        return response.data
    }

    const apply = async (id: string, excludePaths?: string[], metadata?: IClientRequestMetadataExtended): Promise<AiChangeRequest> => {
        const response = await apiClient.doRequest<AiChangeRequest, { excludePaths?: string[] }>({
            url: `/api/ai-changes/${id}/apply`,
            method: "POST",
            data: { excludePaths },
            ...metadata
        })
        return response.data
    }

    const discard = async (id: string): Promise<AiChangeRequest> => {
        const response = await apiClient.doRequest<AiChangeRequest>({
            url: `/api/ai-changes/${id}/discard`,
            method: "POST",
            // The client always sends a JSON content type, and Fastify rejects an empty JSON body.
            data: {}
        })
        return response.data
    }

    return {
        create,
        getByMicrofrontendId,
        getSingle,
        apply,
        discard
    }
}

export default useAiChangesApi
