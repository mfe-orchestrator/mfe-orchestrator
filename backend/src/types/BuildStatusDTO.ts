import { CodeRepositoryProvider } from "../models/CodeRepositoryModel"

/**
 * Provider-neutral outcome of a CI run.
 *
 * GitHub, GitLab and Azure DevOps each describe a run with their own vocabulary
 * (and GitHub splits it over two fields, `status` and `conclusion`); the console
 * only ever needs to know which of these six buckets the run falls into, so the
 * translation happens once, in the clients' normalisers.
 */
export enum BuildStatus {
    QUEUED = "QUEUED",
    RUNNING = "RUNNING",
    SUCCESS = "SUCCESS",
    FAILED = "FAILED",
    CANCELED = "CANCELED",
    UNKNOWN = "UNKNOWN"
}

export interface BuildRunDTO {
    /** Identifier assigned by the provider, unique inside its repository. */
    id: string
    /** Workflow / pipeline / build definition name, when the provider exposes one. */
    name?: string
    status: BuildStatus
    /** Git ref the run was started from, tag name included, without the `refs/*` prefix. */
    ref?: string
    commitSha?: string
    /** Link to the run on the provider, so the user can jump to the logs. */
    url?: string
    triggeredBy?: string
    startedAt?: string
    finishedAt?: string
}

/**
 * Why a microfrontend carries no run at all: the console shows this instead of an
 * empty list, so "never built" is never confused with "we could not ask".
 */
export enum BuildUnavailableReason {
    NO_REPOSITORY = "NO_REPOSITORY",
    REPOSITORY_NOT_FOUND = "REPOSITORY_NOT_FOUND",
    PROVIDER_ERROR = "PROVIDER_ERROR"
}

export interface MicrofrontendBuildStatusDTO {
    microfrontendId: string
    name: string
    slug: string
    provider?: CodeRepositoryProvider
    repositoryName?: string
    /** Version the microfrontend itself currently points at. */
    selectedVersion?: string
    /** Most recent version whose bundle actually reached the platform. */
    latestBuiltVersion?: string
    /** Version served by each environment, taken from that environment's active deployment. */
    versionByEnvironmentId: Record<string, string>
    builds: BuildRunDTO[]
    unavailableReason?: BuildUnavailableReason
}

export interface BuildStatusEnvironmentDTO {
    _id: string
    name: string
    slug: string
    color?: string
    isProduction: boolean
}

export interface ProjectBuildStatusDTO {
    projectId: string
    /** When this snapshot was read from the providers, not when it was sent. */
    fetchedAt: string
    environments: BuildStatusEnvironmentDTO[]
    microfrontends: MicrofrontendBuildStatusDTO[]
}
