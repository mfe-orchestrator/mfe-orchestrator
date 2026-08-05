import { Schema } from "mongoose"
import { fastify } from ".."
import AzureDevOpsClient from "../client/AzureDevOpsClient"
import GithubClient from "../client/GithubClient"
import GitlabClient from "../client/GitlabClient"
import NpmRegistryClient, { NpmPackageInfo } from "../client/NpmRegistryClient"
import { createBusinessException } from "../errors/BusinessException"
import CodeRepository, { CodeRepositoryProvider, ICodeRepository } from "../models/CodeRepositoryModel"
import Microfrontend, { IMicrofrontend } from "../models/MicrofrontendModel"
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
import { toObjectId } from "../utils/mongooseUtils"
import { diffVersions, minVersionOfRange, parseVersion, pickHighestRange } from "../utils/semverUtils"
import BaseAuthorizedService from "./BaseAuthorizedService"
import CodeRepositoryService from "./CodeRepositoryService"

const PACKAGE_JSON_PATH = "package.json"
const DEFAULT_ALIGNMENT_BRANCH = "chore/align-peer-dependencies"
const DEFAULT_COMMIT_MESSAGE = "chore(deps): align peer dependencies"
const BRANCH_NAME_PATTERN = /^[A-Za-z0-9._\-/]+$/
const REPOSITORY_CONCURRENCY = 4

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

interface RepositoryTarget {
    microfrontend: IMicrofrontend
    codeRepository: ICodeRepository
    repositoryName: string
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

const mapWithConcurrency = async <T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>): Promise<R[]> => {
    const results: R[] = new Array(items.length)
    let cursor = 0

    const worker = async () => {
        while (cursor < items.length) {
            const index = cursor++
            results[index] = await mapper(items[index])
        }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))

    return results
}

const toErrorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error))

export class MicrofrontendDependencyService extends BaseAuthorizedService {
    private readonly npmRegistryClient = new NpmRegistryClient()

    /**
     * Lists what the scan would walk: one entry per microfrontend backed by a code repository,
     * with its default branch and the branches available to compare.
     */
    async getScanTargets(projectId: string | Schema.Types.ObjectId): Promise<MicrofrontendScanTargetDTO[]> {
        const targets = await this.resolveTargets(projectId)

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
                const [defaultBranch, branches] = await Promise.all([this.getDefaultBranch(target), this.listBranches(target)])
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
     * Every microfrontend of the project backed by a code repository, paired with the
     * connection it belongs to. `codeRepository` is left undefined when the connection
     * referenced by the microfrontend no longer exists.
     */
    private async resolveTargets(projectId: string | Schema.Types.ObjectId): Promise<RepositoryTarget[]> {
        const projectIdObj = toObjectId(projectId)
        await this.ensureAccessToProject(projectIdObj)

        const microfrontends = await Microfrontend.find({ projectId: projectIdObj }).sort({ slug: 1 })
        const withRepository = microfrontends.filter(microfrontend => microfrontend.codeRepository?.enabled && microfrontend.codeRepository?.codeRepositoryId)

        if (withRepository.length === 0) {
            return []
        }

        const codeRepositoryIds = [...new Set(withRepository.map(microfrontend => microfrontend.codeRepository!.codeRepositoryId.toString()))]
        const codeRepositories = await CodeRepository.find({ _id: { $in: codeRepositoryIds.map(id => toObjectId(id)) } })
        const codeRepositoryById = new Map(codeRepositories.map(codeRepository => [codeRepository._id.toString(), codeRepository]))

        return withRepository.map(microfrontend => {
            const codeRepository = codeRepositoryById.get(microfrontend.codeRepository!.codeRepositoryId.toString())

            return {
                microfrontend,
                codeRepository: codeRepository as ICodeRepository,
                repositoryName: codeRepository ? this.resolveRepositoryName(microfrontend, codeRepository) : microfrontend.codeRepository?.name || ""
            }
        })
    }

    /**
     * Loads the package.json of every microfrontend backed by a repository, on the branch
     * requested for it or on the repository default branch.
     * Failures are captured per microfrontend so one broken repository does not hide the others.
     */
    private async collectSnapshots(projectId: string | Schema.Types.ObjectId, request: DependencyScanRequestDTO = {}): Promise<ManifestSnapshot[]> {
        const targets = await this.resolveTargets(projectId)

        return mapWithConcurrency(targets, REPOSITORY_CONCURRENCY, async target => {
            const microfrontendId = target.microfrontend._id.toString()

            if (!target.codeRepository) {
                return { target, branch: "", defaultBranch: "", error: "Code repository connection not found" }
            }

            try {
                const defaultBranch = await this.getDefaultBranch(target)
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

    /**
     * Branch names available for comparison, through the same unified mapping used by the
     * repository settings screen.
     */
    private async listBranches(target: RepositoryTarget): Promise<string[]> {
        const branches = await new CodeRepositoryService(this.user).getBranches(target.codeRepository._id.toString(), target.repositoryName)
        return [...new Set(branches.map(branch => branch.branch).filter(Boolean))]
    }

    private resolveRepositoryName(microfrontend: IMicrofrontend, codeRepository: ICodeRepository): string {
        const repository = microfrontend.codeRepository

        if (codeRepository.provider === CodeRepositoryProvider.GITHUB) {
            return repository?.name || repository?.repositoryId || ""
        }

        return repository?.repositoryId || repository?.name || ""
    }

    private async getDefaultBranch(target: RepositoryTarget): Promise<string> {
        const { codeRepository, repositoryName } = target

        switch (codeRepository.provider) {
            case CodeRepositoryProvider.GITHUB: {
                const repository = await new GithubClient().getRepository({
                    accessToken: codeRepository.accessToken,
                    orgName: codeRepository.githubData?.organizationId,
                    userName: codeRepository.githubData?.userName,
                    repositoryName
                })
                return repository.default_branch || "main"
            }
            case CodeRepositoryProvider.GITLAB: {
                this.ensureGitlabData(codeRepository)
                const project = await new GitlabClient(codeRepository.gitlabData!.url, codeRepository.accessToken).getProject(encodeURIComponent(repositoryName))
                return project.default_branch || "main"
            }
            case CodeRepositoryProvider.AZURE_DEV_OPS: {
                this.ensureAzureData(codeRepository)
                const repository = await new AzureDevOpsClient().getRepository(codeRepository.accessToken, codeRepository.azureData!.organization, codeRepository.azureData!.projectId, repositoryName)
                return (repository?.defaultBranch || "refs/heads/main").replace("refs/heads/", "")
            }
            default:
                throw createBusinessException({
                    code: "UNSUPPORTED_PROVIDER",
                    message: `Unsupported code repository provider: ${codeRepository.provider}`
                })
        }
    }

    private async readManifest(target: RepositoryTarget, branch: string): Promise<ManifestFile | null> {
        const { codeRepository, repositoryName } = target
        let raw: string | null = null
        let sha: string | undefined

        switch (codeRepository.provider) {
            case CodeRepositoryProvider.GITHUB: {
                const file = await new GithubClient().getFileContent({
                    accessToken: codeRepository.accessToken,
                    orgName: codeRepository.githubData?.organizationId,
                    userName: codeRepository.githubData?.userName,
                    repositoryName,
                    path: PACKAGE_JSON_PATH,
                    ref: branch
                })
                raw = file?.content ?? null
                sha = file?.sha
                break
            }
            case CodeRepositoryProvider.GITLAB: {
                this.ensureGitlabData(codeRepository)
                raw = await new GitlabClient(codeRepository.gitlabData!.url, codeRepository.accessToken).getFileContent(encodeURIComponent(repositoryName), PACKAGE_JSON_PATH, branch)
                break
            }
            case CodeRepositoryProvider.AZURE_DEV_OPS: {
                this.ensureAzureData(codeRepository)
                raw = await new AzureDevOpsClient().getFileContent(
                    codeRepository.accessToken,
                    codeRepository.azureData!.organization,
                    codeRepository.azureData!.projectId,
                    repositoryName,
                    PACKAGE_JSON_PATH,
                    branch
                )
                break
            }
            default:
                throw createBusinessException({
                    code: "UNSUPPORTED_PROVIDER",
                    message: `Unsupported code repository provider: ${codeRepository.provider}`
                })
        }

        if (raw === null || raw === undefined) {
            return null
        }

        let manifest: PackageManifest
        try {
            manifest = JSON.parse(raw) as PackageManifest
        } catch (error) {
            throw createBusinessException({
                code: "INVALID_PACKAGE_JSON",
                message: `${PACKAGE_JSON_PATH} of "${repositoryName}" is not valid JSON: ${toErrorMessage(error)}`
            })
        }

        return { raw, manifest, sha }
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
        const { codeRepository, repositoryName } = snapshot.target

        switch (codeRepository.provider) {
            case CodeRepositoryProvider.GITHUB:
                return this.commitAlignmentGithub(snapshot, targetBranch, changes, commitMessage)
            case CodeRepositoryProvider.GITLAB:
                return this.commitAlignmentGitlab(snapshot, targetBranch, changes, commitMessage)
            case CodeRepositoryProvider.AZURE_DEV_OPS:
                return this.commitAlignmentAzure(snapshot, targetBranch, changes, commitMessage)
            default:
                throw createBusinessException({
                    code: "UNSUPPORTED_PROVIDER",
                    message: `Unsupported code repository provider for "${repositoryName}": ${codeRepository.provider}`
                })
        }
    }

    private async commitAlignmentGithub(snapshot: ManifestSnapshot, targetBranch: string, changes: MicrofrontendAlignmentChangeDTO[], commitMessage: string): Promise<boolean> {
        const { codeRepository, repositoryName } = snapshot.target
        const githubClient = new GithubClient()
        const orgName = codeRepository.githubData?.organizationId
        const userName = codeRepository.githubData?.userName

        const baseSha = await githubClient.getBranchCommitSha(codeRepository.accessToken, repositoryName, snapshot.branch, orgName, userName)
        await githubClient.createBranch({
            accessToken: codeRepository.accessToken,
            orgName,
            userName,
            repositoryName,
            branchName: targetBranch,
            sha: baseSha
        })

        // Re-read on the target branch so re-running the alignment stays idempotent
        const file = await githubClient.getFileContent({
            accessToken: codeRepository.accessToken,
            orgName,
            userName,
            repositoryName,
            path: PACKAGE_JSON_PATH,
            ref: targetBranch
        })

        if (!file) {
            throw createBusinessException({
                code: "PACKAGE_JSON_NOT_FOUND",
                message: `${PACKAGE_JSON_PATH} not found on branch "${targetBranch}" of "${repositoryName}"`
            })
        }

        const manifest = JSON.parse(file.content) as PackageManifest
        const updated = this.applyChangesToManifest(manifest, changes)
        if (!updated) {
            return false
        }

        await githubClient.updateFileContent({
            accessToken: codeRepository.accessToken,
            orgName,
            userName,
            repositoryName,
            path: PACKAGE_JSON_PATH,
            content: this.serializeManifest(file.content, updated),
            message: this.buildCommitMessage(commitMessage, changes),
            branch: targetBranch,
            sha: file.sha
        })

        return true
    }

    private async commitAlignmentGitlab(snapshot: ManifestSnapshot, targetBranch: string, changes: MicrofrontendAlignmentChangeDTO[], commitMessage: string): Promise<boolean> {
        const { codeRepository, repositoryName } = snapshot.target
        this.ensureGitlabData(codeRepository)

        const gitlabClient = new GitlabClient(codeRepository.gitlabData!.url, codeRepository.accessToken)
        const projectId = encodeURIComponent(repositoryName)
        const branchAlreadyExists = await gitlabClient.branchExists(projectId, targetBranch)
        const sourceBranch = branchAlreadyExists ? targetBranch : snapshot.branch

        const raw = await gitlabClient.getFileContent(projectId, PACKAGE_JSON_PATH, sourceBranch)
        if (raw === null) {
            throw createBusinessException({
                code: "PACKAGE_JSON_NOT_FOUND",
                message: `${PACKAGE_JSON_PATH} not found on branch "${sourceBranch}" of "${repositoryName}"`
            })
        }

        const updated = this.applyChangesToManifest(JSON.parse(raw) as PackageManifest, changes)
        if (!updated) {
            return false
        }

        await gitlabClient.commitFiles(projectId, {
            branch: targetBranch,
            startBranch: branchAlreadyExists ? undefined : snapshot.branch,
            commitMessage: this.buildCommitMessage(commitMessage, changes),
            actions: [
                {
                    action: "update",
                    file_path: PACKAGE_JSON_PATH,
                    content: this.serializeManifest(raw, updated)
                }
            ]
        })

        return true
    }

    private async commitAlignmentAzure(snapshot: ManifestSnapshot, targetBranch: string, changes: MicrofrontendAlignmentChangeDTO[], commitMessage: string): Promise<boolean> {
        const { codeRepository, repositoryName } = snapshot.target
        this.ensureAzureData(codeRepository)

        const azureClient = new AzureDevOpsClient()
        const { organization, projectId } = codeRepository.azureData!

        const existingCommitId = await azureClient.getBranchCommitId(codeRepository.accessToken, organization, projectId, repositoryName, targetBranch).catch(() => undefined)

        const sourceBranch = existingCommitId ? targetBranch : snapshot.branch
        const baseCommitId = existingCommitId || (await azureClient.getBranchCommitId(codeRepository.accessToken, organization, projectId, repositoryName, snapshot.branch))

        const raw = await azureClient.getFileContent(codeRepository.accessToken, organization, projectId, repositoryName, PACKAGE_JSON_PATH, sourceBranch)
        if (raw === null) {
            throw createBusinessException({
                code: "PACKAGE_JSON_NOT_FOUND",
                message: `${PACKAGE_JSON_PATH} not found on branch "${sourceBranch}" of "${repositoryName}"`
            })
        }

        const updated = this.applyChangesToManifest(JSON.parse(raw) as PackageManifest, changes)
        if (!updated) {
            return false
        }

        await azureClient.pushFileEdit(codeRepository.accessToken, organization, projectId, repositoryName, {
            branchName: targetBranch,
            baseCommitId,
            filePath: PACKAGE_JSON_PATH,
            content: this.serializeManifest(raw, updated),
            comment: this.buildCommitMessage(commitMessage, changes)
        })

        return true
    }

    private ensureGitlabData(codeRepository: ICodeRepository) {
        if (!codeRepository.gitlabData?.url) {
            throw createBusinessException({
                code: "INVALID_PROVIDER",
                message: "GitLab connection data is missing"
            })
        }
    }

    private ensureAzureData(codeRepository: ICodeRepository) {
        if (!codeRepository.azureData?.organization || !codeRepository.azureData?.projectId) {
            throw createBusinessException({
                code: "INVALID_PROVIDER",
                message: "Azure DevOps connection data is missing"
            })
        }
    }
}

export default MicrofrontendDependencyService
