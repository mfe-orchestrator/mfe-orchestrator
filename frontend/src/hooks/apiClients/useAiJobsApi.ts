import type { LlmEffort } from "@/types/ConfigResponseDTO"
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

/** What the job did on one repository: the `AiChangeRequest` reviewed on the microfrontend (or service) page, without file contents. */
export interface AiJobRepository {
    requestId: string
    /** Whose repository it is: the `microfrontend*` fields describe a service too. */
    kind: "microfrontend" | "service"
    microfrontendId: string
    microfrontendName: string
    microfrontendSlug: string
    /** The repository on its provider; unset when the component has none any more. */
    repository?: { name: string; cloneUrlHttps?: string }
    status: AiChangeStatus
    files: { path: string; action: "create" | "update" | "delete" }[]
    error?: string
    baseBranch: string
    /** The feature branch the proposal is pushed on. */
    branch?: string
    /** On the feature branch while proposed, on the base once applied. */
    commit?: string
    pushError?: string
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
    scope: "global" | "domain" | "selection"
    /** The functional domain the job was asked from; its follow-ups keep it. */
    domainId?: string
    status: AiJobStatus
    /** Missing on the list endpoint. */
    events?: AiChangeEvent[]
    summary?: string
    error?: string
    /** The cost of this job alone, every model round summed. */
    usage: AiUsage
    /** The reasoning effort the agent worked at. */
    effort: LlmEffort
    /** The AI of the organization the agent worked with; missing on jobs made before AIs were per organization. */
    aiModelId?: string
    repositories: AiJobRepository[]
    createdAt: string
    updatedAt: string
}

export interface AiWorkingAgents {
    microfrontendId: string
    agents: number
}

/** Without `effort`, the backend works at `high`; without `aiModelId`, with the default AI of the project. */
export type CreateAiJobDTO = (
    | { prompt: string; scope: "global" }
    | { prompt: string; scope: "domain"; domainId: string }
    | { prompt: string; scope: "selection"; microfrontendIds: string[]; serviceIds?: string[] }
) & {
    effort?: LlmEffort
    aiModelId?: string
    /** The branch each repository starts from, by microfrontend or service id: its default branch when left out. */
    baseBranches?: Record<string, string>
}

export interface FollowUpAiJobDTO {
    prompt: string
    /** A subset of the parent's repositories; all of them when missing. */
    microfrontendIds?: string[]
    serviceIds?: string[]
    /** The parent's effort when missing. */
    effort?: LlmEffort
    /** The parent's AI when missing and the project can still use it, else the default one. */
    aiModelId?: string
}

/** A microfrontend or a service the AI proposes to create in a domain that has none, with the repository it would be scaffolded in. */
export interface DomainPlanComponent {
    name: string
    slug: string
    /** Slug of a marketplace template of the right kind. */
    template: string
    repositoryName: string
    /** Why the request needs it. */
    reason: string
}

export interface DomainPlanDTO {
    domainId: string
    prompt: string
    /** The default AI of the project when missing. */
    aiModelId?: string
}

export interface DomainPlan {
    microfrontends: DomainPlanComponent[]
    services: DomainPlanComponent[]
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

    /**
     * The user's jobs in the project, newest first, or everyone's on one domain; `active` keeps the running ones
     * and those with a proposal to review.
     */
    const list = async (filter?: { active?: boolean; domainId?: string }, metadata?: IClientRequestMetadataExtended): Promise<AiJob[]> => {
        const response = await apiClient.doRequest<AiJob[]>({
            url: "/api/ai-jobs",
            params: filter?.active || filter?.domainId ? { ...(filter.active ? { active: true } : {}), ...(filter.domainId ? { domainId: filter.domainId } : {}) } : undefined,
            ...metadata
        })
        return response.data
    }

    /** How many agents of anyone in the project are at work on each microfrontend; those with none are left out. */
    const working = async (metadata?: IClientRequestMetadataExtended): Promise<AiWorkingAgents[]> => {
        const response = await apiClient.doRequest<AiWorkingAgents[]>({
            url: "/api/ai-jobs/working",
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

    /** What the AI proposes to create in a domain without microfrontends nor services, for the request: nothing is created yet. */
    const planDomain = async (data: DomainPlanDTO, metadata?: IClientRequestMetadataExtended): Promise<DomainPlan> => {
        const response = await apiClient.doRequest<DomainPlan, DomainPlanDTO>({
            url: "/api/ai-jobs/domain-plan",
            method: "POST",
            data,
            ...metadata
        })
        return response.data
    }

    return {
        create,
        planDomain,
        followUp,
        get,
        chain,
        list,
        working,
        apply
    }
}

export default useAiJobsApi
