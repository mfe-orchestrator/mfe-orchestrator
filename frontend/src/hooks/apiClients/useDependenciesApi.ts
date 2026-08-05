import useApiClient from "../useApiClient"

export enum CodeRepositoryProvider {
    GITHUB = "GITHUB",
    GITLAB = "GITLAB",
    AZURE_DEV_OPS = "AZURE_DEV_OPS"
}

export enum DependencyKind {
    PROD = "PROD",
    DEV = "DEV",
    PEER = "PEER",
    OPTIONAL = "OPTIONAL"
}

export enum DependencyUpdateStatus {
    UP_TO_DATE = "UP_TO_DATE",
    PATCH_BEHIND = "PATCH_BEHIND",
    MINOR_BEHIND = "MINOR_BEHIND",
    MAJOR_BEHIND = "MAJOR_BEHIND",
    UNKNOWN = "UNKNOWN"
}

export interface Dependency {
    name: string
    kind: DependencyKind
    range: string
    declaredVersion?: string
    latestVersion?: string
    status: DependencyUpdateStatus
    deprecated?: boolean
}

export interface MicrofrontendDependencies {
    microfrontendId: string
    slug: string
    name: string
    provider?: CodeRepositoryProvider
    repositoryName?: string
    branch?: string
    packageName?: string
    packageVersion?: string
    dependencies: Dependency[]
    error?: string
}

export interface DependencyOccurrence {
    microfrontendId: string
    slug: string
    name: string
    range: string
    aligned: boolean
}

export interface DependencyAlignmentIssue {
    name: string
    kind: DependencyKind
    suggestedRange: string
    latestVersion?: string
    status: DependencyUpdateStatus
    occurrences: DependencyOccurrence[]
}

export interface ProjectDependenciesReport {
    projectId: string
    scannedAt: string
    registryAvailable: boolean
    microfrontends: MicrofrontendDependencies[]
    peerDependencyIssues: DependencyAlignmentIssue[]
    sharedDependencyIssues: DependencyAlignmentIssue[]
}

export interface MicrofrontendAlignmentChange {
    name: string
    kind: DependencyKind
    currentRange: string
    targetRange: string
}

export interface MicrofrontendAlignmentPlan {
    microfrontendId: string
    slug: string
    name: string
    provider: CodeRepositoryProvider
    repositoryName: string
    baseBranch: string
    changes: MicrofrontendAlignmentChange[]
}

export interface AlignmentPlan {
    projectId: string
    targetBranch: string
    microfrontends: MicrofrontendAlignmentPlan[]
}

export interface AlignmentApplyRequest {
    microfrontendIds?: string[]
    packages?: string[]
    branchName?: string
    commitMessage?: string
}

export interface AlignmentApplyResultItem {
    microfrontendId: string
    slug: string
    name: string
    provider: CodeRepositoryProvider
    repositoryName: string
    baseBranch: string
    branch: string
    applied: boolean
    changes: MicrofrontendAlignmentChange[]
    error?: string
}

export interface AlignmentApplyResult {
    projectId: string
    targetBranch: string
    results: AlignmentApplyResultItem[]
}

const useDependenciesApi = () => {
    const apiClient = useApiClient()

    const getReport = async (): Promise<ProjectDependenciesReport> => {
        const response = await apiClient.doRequest<ProjectDependenciesReport>({
            url: "/api/dependencies"
        })
        return response.data
    }

    const getPeerAlignmentPlan = async (request: AlignmentApplyRequest = {}): Promise<AlignmentPlan> => {
        const response = await apiClient.doRequest<AlignmentPlan>({
            url: "/api/dependencies/peer/alignment-plan",
            method: "POST",
            data: request
        })
        return response.data
    }

    const alignPeerDependencies = async (request: AlignmentApplyRequest = {}): Promise<AlignmentApplyResult> => {
        const response = await apiClient.doRequest<AlignmentApplyResult>({
            url: "/api/dependencies/peer/align",
            method: "POST",
            data: request
        })
        return response.data
    }

    return {
        getReport,
        getPeerAlignmentPlan,
        alignPeerDependencies
    }
}

export default useDependenciesApi
