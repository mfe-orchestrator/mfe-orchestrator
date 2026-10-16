import useApiClient, { IClientRequestMetadataExtended } from "../useApiClient"
import { AiChangeEvent, AiChangeStatus } from "./useAiChangesApi"

export type AiJobStatus = "PENDING" | "RUNNING" | "DONE" | "FAILED"

/** Statuses in which the agent is still working on the job: the panel polls while one of these holds. */
export const AI_JOB_ACTIVE_STATUSES: AiJobStatus[] = ["PENDING", "RUNNING"]

export const isAiJobActive = (status?: AiJobStatus) => Boolean(status && AI_JOB_ACTIVE_STATUSES.includes(status))

export interface AiUsage {
    /** The whole prompt, the cached part included. */
    inputTokens: number
    cachedInputTokens: number
    outputTokens: number
}

/** What the job did on one repository: the `AiChangeRequest` reviewed on the microfrontend page, without file contents. */
export interface AiJobRepository {
    requestId: string
    microfrontendId: string
    microfrontendName: string
    microfrontendSlug: string
    status: AiChangeStatus
    files: { path: string; action: "create" | "update" | "delete" }[]
    error?: string
    branch?: string
    pullRequestUrl?: string
    pullRequestError?: string
}

/** One run of the agent over one or more repositories; a follow-up is a child job of the same chain. */
export interface AiJob {
    _id: string
    projectId: string
    userId: string
    parentJobId?: string
    /** The first job of the chain (its own id on the first one): the key of the panel tabs. */
    rootJobId: string
    prompt: string
    scope: "global" | "selection"
    status: AiJobStatus
    /** Missing on the list endpoint. */
    events?: AiChangeEvent[]
    summary?: string
    error?: string
    /** The cost of this job alone, every model round summed. */
    usage: AiUsage
    repositories: AiJobRepository[]
    createdAt: string
    updatedAt: string
}

export type CreateAiJobDTO = { prompt: string; scope: "global" } | { prompt: string; scope: "selection"; microfrontendIds: string[] }

export interface FollowUpAiJobDTO {
    prompt: string
    /** A subset of the parent's repositories; all of them when missing. */
    microfrontendIds?: string[]
}

/** Project-scoped: the API client sends the `Project-Id` header of the open project. */
const useAiJobsApi = () => {
    const apiClient = useApiClient()

    const create = async (data: CreateAiJobDTO, metadata?: IClientRequestMetadataExtended): Promise<AiJob> => {
        const response = await apiClient.doRequest<AiJob, CreateAiJobDTO>({
            url: "/api/ai-jobs",
            method: "POST",
            data,
            ...metadata
        })
        return response.data
    }

    const followUp = async (id: string, data: FollowUpAiJobDTO, metadata?: IClientRequestMetadataExtended): Promise<AiJob> => {
        const response = await apiClient.doRequest<AiJob, FollowUpAiJobDTO>({
            url: `/api/ai-jobs/${id}/follow-ups`,
            method: "POST",
            data,
            ...metadata
        })
        return response.data
    }

    const get = async (id: string, metadata?: IClientRequestMetadataExtended): Promise<AiJob> => {
        const response = await apiClient.doRequest<AiJob>({
            url: `/api/ai-jobs/${id}`,
            ...metadata
        })
        return response.data
    }

    /** The jobs of the chain `id` belongs to, from the root to the latest, events included. */
    const chain = async (id: string, metadata?: IClientRequestMetadataExtended): Promise<AiJob[]> => {
        const response = await apiClient.doRequest<AiJob[]>({
            url: `/api/ai-jobs/${id}/chain`,
            ...metadata
        })
        return response.data
    }

    /** The user's jobs in the project, newest first; `active` keeps the running ones and those with a proposal to review. */
    const list = async (filter?: { active?: boolean }, metadata?: IClientRequestMetadataExtended): Promise<AiJob[]> => {
        const response = await apiClient.doRequest<AiJob[]>({
            url: "/api/ai-jobs",
            params: filter?.active ? { active: true } : undefined,
            ...metadata
        })
        return response.data
    }

    const apply = async (id: string, metadata?: IClientRequestMetadataExtended): Promise<AiJob> => {
        const response = await apiClient.doRequest<AiJob>({
            url: `/api/ai-jobs/${id}/apply`,
            method: "POST",
            // The client always sends a JSON content type, and Fastify rejects an empty JSON body.
            data: {},
            ...metadata
        })
        return response.data
    }

    return {
        create,
        followUp,
        get,
        chain,
        list,
        apply
    }
}

export default useAiJobsApi
