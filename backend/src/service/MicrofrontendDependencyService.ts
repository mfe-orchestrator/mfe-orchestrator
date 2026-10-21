import { Schema } from "mongoose"
import { fastify } from ".."
import NpmRegistryClient, { NpmPackageInfo } from "../client/NpmRegistryClient"
import { createBusinessException } from "../errors/BusinessException"
import {
    AlignmentApplyRequestDTO,
    AlignmentApplyResultDTO,
    AlignmentApplyResultItemDTO,
    AlignmentPlanDTO,
    DependencyAlignmentIssueDTO,
    DependencyDTO,
    DependencyKind,
    DependencyScanRequestDTO,
    DependencyUpdateStatus,
    MicrofrontendAlignmentChangeDTO,
    MicrofrontendAlignmentPlanDTO,
    MicrofrontendDependenciesDTO,
    MicrofrontendScanTargetDTO,
    ProjectDependenciesReportDTO
} from "../types/MicrofrontendDependencyDTO"
import { diffVersions, minVersionOfRange, parseVersion, pickHighestRange } from "../utils/semverUtils"
import BaseAuthorizedService from "./BaseAuthorizedService"
import RepositoryFileService, { mapWithConcurrency, REPOSITORY_CONCURRENCY, RepositoryTarget, toErrorMessage } from "./RepositoryFileService"

const PACKAGE_JSON_PATH = "package.json"
const DEFAULT_ALIGNMENT_BRANCH = "chore/align-peer-dependencies"
const DEFAULT_COMMIT_MESSAGE = "chore(deps): align peer dependencies"
const BRANCH_NAME_PATTERN = /^[A-Za-z0-9._\-/]+$/

const DEPENDENCY_SECTIONS: { section: string; kind: DependencyKind }[] = [
    { section: "dependencies", kind: DependencyKind.PROD },
    { section: "devDependencies", kind: DependencyKind.DEV },
    { section: "peerDependencies", kind: DependencyKind.PEER },
    { section: "optionalDependencies", kind: DependencyKind.OPTIONAL }
]

const SECTION_BY_KIND: Record<DependencyKind, string> = {
    [DependencyKind.PROD]: "dependencies",
    [DependencyKind.DEV]: "devDependencies",
    [DependencyKind.PEER]: "peerDependencies",
    [DependencyKind.OPTIONAL]: "optionalDependencies"
}

interface PackageManifest {
    name?: string
    version?: string
    [section: string]: unknown
}

interface ManifestFile {
    raw: string
    manifest: PackageManifest
    /** Blob sha, only meaningful for GitHub where updates are optimistic-locked */
    sha?: string
}

interface ManifestSnapshot {
    target: RepositoryTarget
    /** Branch the manifest was read from: the requested one, or the repository default */
    branch: string
    defaultBranch: string
    file?: ManifestFile
    error?: string
}

export class MicrofrontendDependencyService extends BaseAuthorizedService {
    private readonly npmRegistryClient = new NpmRegistryClient()
    private readonly repositoryFiles = new RepositoryFileService(this.user)

    /**
     * Lists what the scan would walk: one entry per microfrontend backed by a code repository,
     * with its default branch and the branches available to compare.
     */
    async getScanTargets(projectId: string | Schema.Types.ObjectId): Promise<MicrofrontendScanTargetDTO[]> {
        const targets = await this.repositoryFiles.resolveTargets(projectId)

        return mapWithConcurrency(targets, REPOSITORY_CONCURRENCY, async target => {
            const base: MicrofrontendScanTargetDTO = {
                microfrontendId: target.microfrontend._id.toString(),
                slug: target.microfrontend.slug,
                name: target.microfrontend.name,
                provider: target.codeRepository?.provider,
                repositoryName: target.repositoryName,
                branches: []
            }

            if (!target.codeRepository) {
                return { ...base, error: "Code repository connection not found" }
            }

            try {
                const [defaultBranch, branches] = await Promise.all([this.repositoryFiles.getDefaultBranch(target), this.repositoryFiles.listBranches(target)])
                return { ...base, defaultBranch, branches: branches.length > 0 ? branches : [defaultBranch] }
            } catch (error) {
                fastify.log.error(error, `Unable to list the branches of ${target.microfrontend.slug}`)
                return { ...base, error: toErrorMessage(error) }
            }
        })
    }

    /**
     * Walks every microfrontend of the project that is backed by a code repository, reads its
     * package.json on the requested branch (the repository default when none is requested) and
     * reports, for each dependency, whether it is up to date with the registry and whether it is
     * aligned with the other microfrontends.
     */
    async getReport(projectId: string | Schema.Types.ObjectId, request: DependencyScanRequestDTO = {}): Promise<ProjectDependenciesReportDTO> {
        const snapshots = await this.collectSnapshots(projectId, request)

        const packageNames = snapshots.flatMap(snapshot => (snapshot.file ? this.getDependencyEntries(snapshot.file.manifest).map(entry => entry.name) : []))
        const registry = await this.npmRegistryClient.getPackagesInfo(packageNames)

        const microfrontends = snapshots.map(snapshot => this.toMicrofrontendDependenciesDTO(snapshot, registry))

        return {
            projectId: projectId.toString(),
            scannedAt: new Date().toISOString(),
            registryAvailable: packageNames.length === 0 || registry.size > 0,
            microfrontends,
            peerDependencyIssues: this.computeAlignmentIssues(microfrontends, DependencyKind.PEER, registry),
            sharedDependencyIssues: this.computeAlignmentIssues(microfrontends, DependencyKind.PROD, registry)
        }
    }

    /**
     * Dry run of the peer dependency alignment: what would change, repository by repository.
     */
    async getAlignmentPlan(projectId: string | Schema.Types.ObjectId, request: AlignmentApplyRequestDTO = {}): Promise<AlignmentPlanDTO> {
        const snapshots = await this.collectSnapshots(projectId, request)
        const targetBranch = this.resolveBranchName(request.branchName)

        return {
            projectId: projectId.toString(),
            targetBranch,
            microfrontends: this.buildPlan(snapshots, request)
        }
    }

    /**
     * Applies the peer dependency alignment by committing the updated package.json on a
     * dedicated branch of every repository, created from the branch that was compared.
     * That base branch is never committed on.
     */
    async applyAlignment(projectId: string | Schema.Types.ObjectId, request: AlignmentApplyRequestDTO = {}): Promise<AlignmentApplyResultDTO> {
        const snapshots = await this.collectSnapshots(projectId, request)
        const targetBranch = this.resolveBranchName(request.branchName)
        const plan = this.buildPlan(snapshots, request)
        const snapshotsById = new Map(snapshots.map(snapshot => [snapshot.target.microfrontend._id.toString(), snapshot]))

        const results = await mapWithConcurrency(plan, REPOSITORY_CONCURRENCY, async planItem => {
            const snapshot = snapshotsById.get(planItem.microfrontendId)
            const result: AlignmentApplyResultItemDTO = {
                microfrontendId: planItem.microfrontendId,
                slug: planItem.slug,
                name: planItem.name,
                provider: planItem.provider,
                repositoryName: planItem.repositoryName,
                baseBranch: planItem.baseBranch,
                branch: targetBranch,
                applied: false,
                changes: planItem.changes
            }

            if (!snapshot) {
                result.error = "Microfrontend snapshot is no longer available"
                return result
            }

            if (planItem.baseBranch === targetBranch) {
                result.error = `Refusing to commit on "${targetBranch}", the branch being compared`
                return result
            }

            try {
                result.applied = await this.commitAlignment(snapshot, targetBranch, planItem.changes, request.commitMessage || DEFAULT_COMMIT_MESSAGE)
            } catch (error) {
                fastify.log.error(error, `Peer dependency alignment failed for ${planItem.slug}`)
                result.error = toErrorMessage(error)
            }

            return result
        })

        return {
            projectId: projectId.toString(),
            targetBranch,
            results
        }
    }

    private resolveBranchName(branchName?: string): string {
        const value = (branchName || DEFAULT_ALIGNMENT_BRANCH).trim()

        if (!BRANCH_NAME_PATTERN.test(value) || value.includes("..") || value.startsWith("/") || value.endsWith("/")) {
            throw createBusinessException({
                code: "INVALID_BRANCH_NAME",
                message: `"${value}" is not a valid branch name`
            })
        }

        return value
    }

    /**
     * Loads the package.json of every microfrontend backed by a repository, on the branch
     * requested for it or on the repository default branch.
     * Failures are captured per microfrontend so one broken repository does not hide the others.
     */
    private async collectSnapshots(projectId: string | Schema.Types.ObjectId, request: DependencyScanRequestDTO = {}): Promise<ManifestSnapshot[]> {
        const targets = await this.repositoryFiles.resolveTargets(projectId)

        return mapWithConcurrency(targets, REPOSITORY_CONCURRENCY, async target => {
            const microfrontendId = target.microfrontend._id.toString()

            if (!target.codeRepository) {
                return { target, branch: "", defaultBranch: "", error: "Code repository connection not found" }
            }

            try {
                const defaultBranch = await this.repositoryFiles.getDefaultBranch(target)
                const requestedBranch = request.branches?.[microfrontendId]?.trim()
                const branch = requestedBranch ? this.resolveBranchName(requestedBranch) : defaultBranch

                const file = await this.readManifest(target, branch)

                if (!file) {
                    return { target, branch, defaultBranch, error: `${PACKAGE_JSON_PATH} not found on branch "${branch}"` }
                }

                return { target, branch, defaultBranch, file }
            } catch (error) {
                fastify.log.error(error, `Unable to read ${PACKAGE_JSON_PATH} for ${target.microfrontend.slug}`)
                return { target, branch: "", defaultBranch: "", error: toErrorMessage(error) }
            }
        })
    }

    /** The package.json of a microfrontend on `branch`, parsed, or null when it is not there. */
    private async readManifest(target: RepositoryTarget, branch: string): Promise<ManifestFile | null> {
        const file = await this.repositoryFiles.readFile(target, PACKAGE_JSON_PATH, branch)

        if (!file) {
            return null
        }

        return { raw: file.raw, manifest: this.parseManifest(file.raw, target.repositoryName), sha: file.sha }
    }

    private parseManifest(raw: string, repositoryName: string): PackageManifest {
        try {
            return JSON.parse(raw) as PackageManifest
        } catch (error) {
            throw createBusinessException({
                code: "INVALID_PACKAGE_JSON",
                message: `${PACKAGE_JSON_PATH} of "${repositoryName}" is not valid JSON: ${toErrorMessage(error)}`
            })
        }
    }

    private getDependencyEntries(manifest: PackageManifest): { name: string; kind: DependencyKind; range: string }[] {
        return DEPENDENCY_SECTIONS.flatMap(({ section, kind }) => {
            const values = manifest[section]
            if (!values || typeof values !== "object") {
                return []
            }

            return Object.entries(values as Record<string, unknown>)
                .filter(([, range]) => typeof range === "string")
                .map(([name, range]) => ({ name, kind, range: range as string }))
        })
    }

    private toMicrofrontendDependenciesDTO(snapshot: ManifestSnapshot, registry: Map<string, NpmPackageInfo>): MicrofrontendDependenciesDTO {
        const { microfrontend, codeRepository, repositoryName } = snapshot.target

        const base: MicrofrontendDependenciesDTO = {
            microfrontendId: microfrontend._id.toString(),
            slug: microfrontend.slug,
            name: microfrontend.name,
            provider: codeRepository?.provider,
            repositoryName,
            branch: snapshot.branch || undefined,
            defaultBranch: snapshot.defaultBranch || undefined,
            dependencies: []
        }

        if (!snapshot.file) {
            return { ...base, error: snapshot.error }
        }

        return {
            ...base,
            packageName: typeof snapshot.file.manifest.name === "string" ? snapshot.file.manifest.name : undefined,
            packageVersion: typeof snapshot.file.manifest.version === "string" ? snapshot.file.manifest.version : undefined,
            dependencies: this.getDependencyEntries(snapshot.file.manifest).map(entry => this.toDependencyDTO(entry, registry.get(entry.name)))
        }
    }

    private toDependencyDTO(entry: { name: string; kind: DependencyKind; range: string }, info?: NpmPackageInfo): DependencyDTO {
        const declared = minVersionOfRange(entry.range)
        const latest = parseVersion(info?.latest)

        return {
            name: entry.name,
            kind: entry.kind,
            range: entry.range,
            declaredVersion: declared?.raw,
            latestVersion: info?.latest,
            status: this.toUpdateStatus(declared, latest),
            deprecated: info?.deprecated || undefined
        }
    }

    private toUpdateStatus(declared: ReturnType<typeof parseVersion>, latest: ReturnType<typeof parseVersion>): DependencyUpdateStatus {
        if (!declared || !latest) {
            return DependencyUpdateStatus.UNKNOWN
        }

        switch (diffVersions(declared, latest)) {
            case "MAJOR":
                return DependencyUpdateStatus.MAJOR_BEHIND
            case "MINOR":
                return DependencyUpdateStatus.MINOR_BEHIND
            case "PATCH":
                return DependencyUpdateStatus.PATCH_BEHIND
            default:
                return DependencyUpdateStatus.UP_TO_DATE
        }
    }

    /**
     * A package is misaligned when two microfrontends declare it with different ranges.
     * The suggested range is the highest one already in use inside the project, so the
     * alignment never introduces a version nobody has validated yet.
     */
    private computeAlignmentIssues(microfrontends: MicrofrontendDependenciesDTO[], kind: DependencyKind, registry: Map<string, NpmPackageInfo>): DependencyAlignmentIssueDTO[] {
        const occurrencesByPackage = new Map<string, { microfrontendId: string; slug: string; name: string; range: string }[]>()

        for (const microfrontend of microfrontends) {
            for (const dependency of microfrontend.dependencies) {
                if (dependency.kind !== kind) {
                    continue
                }

                const occurrences = occurrencesByPackage.get(dependency.name) || []
                occurrences.push({
                    microfrontendId: microfrontend.microfrontendId,
                    slug: microfrontend.slug,
                    name: microfrontend.name,
                    range: dependency.range
                })
                occurrencesByPackage.set(dependency.name, occurrences)
            }
        }

        const issues: DependencyAlignmentIssueDTO[] = []

        for (const [packageName, occurrences] of occurrencesByPackage) {
            const ranges = occurrences.map(occurrence => occurrence.range)
            if (occurrences.length < 2 || new Set(ranges).size < 2) {
                continue
            }

            const suggestedRange = pickHighestRange(ranges)
            if (!suggestedRange) {
                continue
            }

            const info = registry.get(packageName)

            issues.push({
                name: packageName,
                kind,
                suggestedRange,
                latestVersion: info?.latest,
                status: this.toUpdateStatus(minVersionOfRange(suggestedRange), parseVersion(info?.latest)),
                occurrences: occurrences.map(occurrence => ({
                    ...occurrence,
                    aligned: occurrence.range === suggestedRange
                }))
            })
        }

        return issues.sort((a, b) => a.name.localeCompare(b.name))
    }

    private buildPlan(snapshots: ManifestSnapshot[], request: AlignmentApplyRequestDTO): MicrofrontendAlignmentPlanDTO[] {
        const registry = new Map<string, NpmPackageInfo>()
        const microfrontends = snapshots.map(snapshot => this.toMicrofrontendDependenciesDTO(snapshot, registry))

        const packageFilter = request.packages?.length ? new Set(request.packages) : undefined
        const microfrontendFilter = request.microfrontendIds?.length ? new Set(request.microfrontendIds) : undefined

        const issues = this.computeAlignmentIssues(microfrontends, DependencyKind.PEER, registry).filter(issue => !packageFilter || packageFilter.has(issue.name))

        const changesByMicrofrontend = new Map<string, MicrofrontendAlignmentChangeDTO[]>()

        for (const issue of issues) {
            for (const occurrence of issue.occurrences) {
                if (occurrence.aligned) {
                    continue
                }
                if (microfrontendFilter && !microfrontendFilter.has(occurrence.microfrontendId)) {
                    continue
                }

                const changes = changesByMicrofrontend.get(occurrence.microfrontendId) || []
                changes.push({
                    name: issue.name,
                    kind: issue.kind,
                    currentRange: occurrence.range,
                    targetRange: issue.suggestedRange
                })
                changesByMicrofrontend.set(occurrence.microfrontendId, changes)
            }
        }

        return snapshots
            .filter(snapshot => changesByMicrofrontend.has(snapshot.target.microfrontend._id.toString()))
            .map(snapshot => ({
                microfrontendId: snapshot.target.microfrontend._id.toString(),
                slug: snapshot.target.microfrontend.slug,
                name: snapshot.target.microfrontend.name,
                provider: snapshot.target.codeRepository.provider,
                repositoryName: snapshot.target.repositoryName,
                baseBranch: snapshot.branch,
                changes: changesByMicrofrontend.get(snapshot.target.microfrontend._id.toString()) || []
            }))
    }

    /**
     * Rewrites the ranges inside the manifest, keeping the original key order.
     * Returns null when nothing actually changes.
     */
    private applyChangesToManifest(manifest: PackageManifest, changes: MicrofrontendAlignmentChangeDTO[]): PackageManifest | null {
        const updated: PackageManifest = JSON.parse(JSON.stringify(manifest))
        let touched = false

        for (const change of changes) {
            const section = SECTION_BY_KIND[change.kind]
            const values = updated[section]

            if (!values || typeof values !== "object") {
                continue
            }

            const typedValues = values as Record<string, string>
            if (typedValues[change.name] === undefined || typedValues[change.name] === change.targetRange) {
                continue
            }

            typedValues[change.name] = change.targetRange
            touched = true
        }

        return touched ? updated : null
    }

    private serializeManifest(raw: string, manifest: PackageManifest): string {
        const indentMatch = /\n([ \t]+)"/.exec(raw)
        const indent = indentMatch ? indentMatch[1] : "  "
        const trailingNewline = raw.endsWith("\n") ? "\n" : ""

        return `${JSON.stringify(manifest, null, indent)}${trailingNewline}`
    }

    private buildCommitMessage(headline: string, changes: MicrofrontendAlignmentChangeDTO[]): string {
        const body = changes.map(change => `- ${change.name}: ${change.currentRange} -> ${change.targetRange}`).join("\n")
        return `${headline}\n\n${body}`
    }

    /**
     * Creates (or reuses) the alignment branch and commits the updated manifest on it.
     * Returns false when the branch already carries the aligned ranges.
     */
    private async commitAlignment(snapshot: ManifestSnapshot, targetBranch: string, changes: MicrofrontendAlignmentChangeDTO[], commitMessage: string): Promise<boolean> {
        const { target } = snapshot

        // Read the alignment branch first, falling back to the branch it is created from, so
        // re-running the alignment builds on what is already committed there
        const { file, sourceBranch } = await this.repositoryFiles.readFileForWrite(target, PACKAGE_JSON_PATH, targetBranch, snapshot.branch)

        if (!file) {
            throw createBusinessException({
                code: "PACKAGE_JSON_NOT_FOUND",
                message: `${PACKAGE_JSON_PATH} not found on branch "${sourceBranch}" of "${target.repositoryName}"`
            })
        }

        const updated = this.applyChangesToManifest(this.parseManifest(file.raw, target.repositoryName), changes)

        if (!updated) {
            return false
        }

        await this.repositoryFiles.writeFile(target, {
            path: PACKAGE_JSON_PATH,
            content: this.serializeManifest(file.raw, updated),
            branch: targetBranch,
            message: this.buildCommitMessage(commitMessage, changes),
            existing: file,
            createBranchFrom: snapshot.branch
        })

        return true
    }
}

export default MicrofrontendDependencyService
