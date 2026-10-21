import type { LlmEffort } from "@/types/ConfigResponseDTO"
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
    /** `info` carries a machine code, `tool` a tool call, `text` what the model said, `thinking` the summary of its reasoning. */
    kind: "info" | "tool" | "text" | "thinking"
    message: string
}

/** What owns the repository an AI change works on: a microfrontend or a backend service. */
export interface AiChangeTarget {
    kind: "microfrontend" | "service"
    id: string
}

const targetPath = (target: AiChangeTarget) => `/api/${target.kind === "service" ? "services" : "microfrontends"}/${target.id}/ai-changes`

export interface AiChangeRequest {
    _id: string
    projectId: string
    /** Exactly one of the two is set. */
    microfrontendId?: string
    serviceId?: string
    userId: string
    prompt: string
    baseBranch: string
    baseCommit?: string
    status: AiChangeStatus
    files: AiChangeFile[]
    summary?: string
    /** Missing on the list endpoint. */
    events?: AiChangeEvent[]
    /** The feature branch the proposal is pushed on. */
    branch?: string
    /** On the feature branch while proposed, on the base once applied. */
    commit?: string
    /** The proposal could not be pushed on its branch: applying it, or opening its pull request, pushes it again. */
    pushError?: string
    pullRequestUrl?: string
    pullRequestError?: string
    error?: string
    /** The job that made the request: one run of the agent, possibly over several repositories. */
    jobId?: string
    /** The proposal this one starts from, when the job was a follow-up. */
    parentId?: string
    /** The conversation the request is a message of: the first job of its chain of follow-ups, or the request itself before jobs. */
    conversationId: string
    /** How many repositories the job works on: above one, its cost is shared with the other requests. */
    jobRepositoryCount?: number
    /** The cost of the whole job, the same on each of its requests; updated while the agent works. */
    usage: { inputTokens: number; cachedInputTokens?: number; outputTokens: number }
    /** The reasoning effort of the job, the same on each of its requests. */
    effort: LlmEffort
    /** The AI of the organization the job worked with; missing on requests made before AIs were per organization. */
    aiModelId?: string
    createdAt: string
    updatedAt: string
}

export interface CreateAiChangeDTO {
    prompt: string
    baseBranch?: string
    /** Without it, the backend works at `high`. */
    effort?: LlmEffort
    /** Without it, the backend works with the default AI of the project. */
    aiModelId?: string
}

const useAiChangesApi = () => {
    const apiClient = useApiClient()

    const create = async (target: AiChangeTarget, data: CreateAiChangeDTO, metadata?: IClientRequestMetadataExtended): Promise<AiChangeRequest> => {
        const response = await apiClient.doRequest<AiChangeRequest, CreateAiChangeDTO>({
            url: targetPath(target),
            method: "POST",
            data,
            ...metadata
        })
        return response.data
    }

    const getByTarget = async (target: AiChangeTarget): Promise<AiChangeRequest[]> => {
        const response = await apiClient.doRequest<AiChangeRequest[]>({
            url: targetPath(target)
        })
        return response.data
    }

    const getSingle = async (id: string): Promise<AiChangeRequest> => {
        const response = await apiClient.doRequest<AiChangeRequest>({
            url: `/api/ai-changes/${id}`
        })
        return response.data
    }

    /** Applies the whole proposal: its files depend on each other, so none can be left out. */
    const apply = async (id: string, metadata?: IClientRequestMetadataExtended): Promise<AiChangeRequest> => {
        const response = await apiClient.doRequest<AiChangeRequest, Record<string, never>>({
            url: `/api/ai-changes/${id}/apply`,
            method: "POST",
            data: {},
            ...metadata
        })
        return response.data
    }

    /** Opens a pull request from the proposal's branch onto its base: the proposal stays open. */
    const openPullRequest = async (id: string, metadata?: IClientRequestMetadataExtended): Promise<AiChangeRequest> => {
        const response = await apiClient.doRequest<AiChangeRequest>({
            url: `/api/ai-changes/${id}/pull-request`,
            method: "POST",
            // The client always sends a JSON content type, and Fastify rejects an empty JSON body.
            data: {},
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
        getByTarget,
        getSingle,
        apply,
        openPullRequest,
        discard
    }
}

export default useAiChangesApi
