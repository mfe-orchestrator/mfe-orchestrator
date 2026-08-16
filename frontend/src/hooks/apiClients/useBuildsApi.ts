import useProjectStore from "@/store/useProjectStore"
import useApiClient from "../useApiClient"
import useEventStream, { EventStreamState } from "../useEventStream"

export enum BuildStatus {
    QUEUED = "QUEUED",
    RUNNING = "RUNNING",
    SUCCESS = "SUCCESS",
    FAILED = "FAILED",
    CANCELED = "CANCELED",
    UNKNOWN = "UNKNOWN"
}

export enum BuildUnavailableReason {
    NO_REPOSITORY = "NO_REPOSITORY",
    REPOSITORY_NOT_FOUND = "REPOSITORY_NOT_FOUND",
    PROVIDER_ERROR = "PROVIDER_ERROR"
}

export interface BuildRun {
    id: string
    name?: string
    status: BuildStatus
    /** Tag or branch the run was started from. */
    ref?: string
    commitSha?: string
    url?: string
    triggeredBy?: string
    startedAt?: string
    finishedAt?: string
}

export interface MicrofrontendBuildStatus {
    microfrontendId: string
    name: string
    slug: string
    provider?: string
    repositoryName?: string
    selectedVersion?: string
    latestBuiltVersion?: string
    /** Version each environment currently serves, keyed by environment id. */
    versionByEnvironmentId: Record<string, string>
    builds: BuildRun[]
    unavailableReason?: BuildUnavailableReason
}

export interface BuildStatusEnvironment {
    _id: string
    name: string
    slug: string
    color?: string
    isProduction: boolean
}

export interface ProjectBuildStatus {
    projectId: string
    fetchedAt: string
    environments: BuildStatusEnvironment[]
    microfrontends: MicrofrontendBuildStatus[]
}

export const BUILD_STATUS_QUERY_KEY = "build-status"

const useBuildsApi = () => {
    const apiClient = useApiClient()

    const getBuildStatus = async (): Promise<ProjectBuildStatus> => {
        const response = await apiClient.doRequest<ProjectBuildStatus>({
            url: `/api/builds`
        })
        return response.data
    }

    return {
        getBuildStatus
    }
}

/**
 * Keeps the build status up to date over SSE for as long as the caller is mounted.
 *
 * The stream sends a full snapshot on connect and then only when something actually
 * changed, so the consumer can treat every event as the new truth.
 */
export const useBuildStatusStream = (onSnapshot: (snapshot: ProjectBuildStatus) => void, enabled = true): EventStreamState => {
    const { getToken } = useApiClient()
    const projectStore = useProjectStore()
    const projectId = projectStore.project?._id

    // Not memoised on purpose: useEventStream keeps this in a ref and calls it afresh
    // on every connection attempt, so a new identity per render costs nothing and the
    // token is always the current one.
    const getHeaders = async () => {
        const token = await getToken()
        return {
            Authorization: token?.token ? `Bearer ${token.token}` : undefined,
            issuer: token?.issuer,
            "Project-Id": projectId
        }
    }

    return useEventStream<ProjectBuildStatus>({
        url: `/api/builds/stream`,
        eventName: "snapshot",
        enabled: enabled && Boolean(projectId),
        // The project travels in a header, so switching project has to reopen the
        // stream: the URL alone would look unchanged.
        connectionKey: projectId,
        getHeaders,
        onEvent: onSnapshot
    })
}

export default useBuildsApi
