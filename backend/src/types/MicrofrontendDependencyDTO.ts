import { CodeRepositoryProvider } from "../models/CodeRepositoryModel"

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

export interface DependencyDTO {
    name: string
    kind: DependencyKind
    /** Range as declared in the package.json, e.g. "^18.2.0" */
    range: string
    /** Lowest version satisfying the range, when it can be resolved */
    declaredVersion?: string
    /** Version currently tagged as `latest` on the registry */
    latestVersion?: string
    status: DependencyUpdateStatus
    deprecated?: boolean
}

export interface MicrofrontendDependenciesDTO {
    microfrontendId: string
    slug: string
    name: string
    provider?: CodeRepositoryProvider
    repositoryName?: string
    branch?: string
    packageName?: string
    packageVersion?: string
    dependencies: DependencyDTO[]
    /** Set when the package.json could not be read (missing file, revoked token, ...) */
    error?: string
}

export interface DependencyOccurrenceDTO {
    microfrontendId: string
    slug: string
    name: string
    range: string
    aligned: boolean
}

export interface DependencyAlignmentIssueDTO {
    name: string
    kind: DependencyKind
    /** Range every microfrontend should converge to */
    suggestedRange: string
    latestVersion?: string
    /** Status of the suggested range against the registry */
    status: DependencyUpdateStatus
    occurrences: DependencyOccurrenceDTO[]
}

export interface ProjectDependenciesReportDTO {
    projectId: string
    scannedAt: string
    /** False when the npm registry could not be reached at all */
    registryAvailable: boolean
    microfrontends: MicrofrontendDependenciesDTO[]
    /** Cross-microfrontend mismatches on peerDependencies */
    peerDependencyIssues: DependencyAlignmentIssueDTO[]
    /** Cross-microfrontend mismatches on dependencies, reported but never auto-applied */
    sharedDependencyIssues: DependencyAlignmentIssueDTO[]
}

export interface MicrofrontendAlignmentChangeDTO {
    name: string
    kind: DependencyKind
    currentRange: string
    targetRange: string
}

export interface MicrofrontendAlignmentPlanDTO {
    microfrontendId: string
    slug: string
    name: string
    provider: CodeRepositoryProvider
    repositoryName: string
    /** Branch the changes are computed from */
    baseBranch: string
    changes: MicrofrontendAlignmentChangeDTO[]
}

export interface AlignmentPlanDTO {
    projectId: string
    targetBranch: string
    microfrontends: MicrofrontendAlignmentPlanDTO[]
}

export interface AlignmentApplyRequestDTO {
    /** Restricts the alignment to these microfrontends. Defaults to all of them. */
    microfrontendIds?: string[]
    /** Restricts the alignment to these package names. Defaults to every misaligned package. */
    packages?: string[]
    branchName?: string
    commitMessage?: string
}

export interface AlignmentApplyResultItemDTO {
    microfrontendId: string
    slug: string
    name: string
    provider: CodeRepositoryProvider
    repositoryName: string
    baseBranch: string
    branch: string
    applied: boolean
    changes: MicrofrontendAlignmentChangeDTO[]
    error?: string
}

export interface AlignmentApplyResultDTO {
    projectId: string
    targetBranch: string
    results: AlignmentApplyResultItemDTO[]
}
