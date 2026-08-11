import { Schema } from "mongoose"
import AzureDevOpsClient from "../client/AzureDevOpsClient"
import GithubClient from "../client/GithubClient"
import GitlabClient from "../client/GitlabClient"
import { createBusinessException } from "../errors/BusinessException"
import CodeRepository, { CodeRepositoryProvider, ICodeRepository } from "../models/CodeRepositoryModel"
import Microfrontend, { IMicrofrontend } from "../models/MicrofrontendModel"
import { toObjectId } from "../utils/mongooseUtils"
import BaseAuthorizedService from "./BaseAuthorizedService"
import CodeRepositoryService from "./CodeRepositoryService"

/** How many repositories are talked to at the same time when walking a whole project */
export const REPOSITORY_CONCURRENCY = 4

export interface RepositoryTarget {
    microfrontend: IMicrofrontend
    codeRepository: ICodeRepository
    repositoryName: string
}

export interface RepositoryFile {
    raw: string
    /** Blob sha, only meaningful for GitHub where updates are optimistic-locked */
    sha?: string
}

export interface WriteFileParams {
    path: string
    content: string
    branch: string
    message: string
    /**
     * The file as readFile returned it, or null when it is not there yet. It is what tells a
     * creation from an update: only GitHub hands out a blob sha, so its presence cannot be the
     * signal on the other providers.
     */
    existing: RepositoryFile | null
    /**
     * Branch `branch` is created from when it does not exist yet. Leave it out to write on a
     * branch that is already there, which is what committing on the default branch does.
     */
    createBranchFrom?: string
}

export const mapWithConcurrency = async <T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>): Promise<R[]> => {
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

export const toErrorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/**
 * Reading and writing files in the repositories backing the microfrontends of a project,
 * behind one API for GitHub, GitLab and Azure DevOps.
 *
 * Every caller that walks a project's repositories goes through here: the dependency
 * alignment, the stack detection and the module federation integration all need the same
 * "resolve the targets, read a file, commit a file" primitives.
 */
export class RepositoryFileService extends BaseAuthorizedService {
    /**
     * Every microfrontend of the project backed by a code repository, paired with the
     * connection it belongs to. `codeRepository` is left undefined when the connection
     * referenced by the microfrontend no longer exists.
     */
    async resolveTargets(projectId: string | Schema.Types.ObjectId): Promise<RepositoryTarget[]> {
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
     * Branch names available for comparison, through the same unified mapping used by the
     * repository settings screen.
     */
    async listBranches(target: RepositoryTarget): Promise<string[]> {
        const branches = await new CodeRepositoryService(this.user).getBranches(target.codeRepository._id.toString(), target.repositoryName)
        return [...new Set(branches.map(branch => branch.branch).filter(Boolean))]
    }

    async getDefaultBranch(target: RepositoryTarget): Promise<string> {
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
                throw this.unsupportedProvider(codeRepository, repositoryName)
        }
    }

    /** Content of `path` on `branch`, or null when the file (or the branch) is not there. */
    async readFile(target: RepositoryTarget, path: string, branch: string): Promise<RepositoryFile | null> {
        const { codeRepository, repositoryName } = target

        switch (codeRepository.provider) {
            case CodeRepositoryProvider.GITHUB: {
                const file = await new GithubClient().getFileContent({
                    accessToken: codeRepository.accessToken,
                    orgName: codeRepository.githubData?.organizationId,
                    userName: codeRepository.githubData?.userName,
                    repositoryName,
                    path,
                    ref: branch
                })
                return file ? { raw: file.content, sha: file.sha } : null
            }
            case CodeRepositoryProvider.GITLAB: {
                this.ensureGitlabData(codeRepository)
                const raw = await new GitlabClient(codeRepository.gitlabData!.url, codeRepository.accessToken).getFileContent(encodeURIComponent(repositoryName), path, branch)
                return raw === null || raw === undefined ? null : { raw }
            }
            case CodeRepositoryProvider.AZURE_DEV_OPS: {
                this.ensureAzureData(codeRepository)
                const raw = await new AzureDevOpsClient().getFileContent(
                    codeRepository.accessToken,
                    codeRepository.azureData!.organization,
                    codeRepository.azureData!.projectId,
                    repositoryName,
                    path,
                    branch
                )
                return raw === null || raw === undefined ? null : { raw }
            }
            default:
                throw this.unsupportedProvider(codeRepository, repositoryName)
        }
    }

    /**
     * The file as it stands where a write is about to land: `branch` when it already carries it,
     * the fallback branch otherwise. Reading the target branch first is what makes re-running an
     * integration idempotent instead of reverting to the state of the base branch.
     */
    async readFileForWrite(target: RepositoryTarget, path: string, branch: string, fallbackBranch?: string): Promise<{ file: RepositoryFile | null; sourceBranch: string }> {
        const onTargetBranch = await this.readFile(target, path, branch)
        if (onTargetBranch || !fallbackBranch || fallbackBranch === branch) {
            return { file: onTargetBranch, sourceBranch: branch }
        }

        return { file: await this.readFile(target, path, fallbackBranch), sourceBranch: fallbackBranch }
    }

    /**
     * Commits `content` at `path` on `branch`, creating the file when `existing` is null and the
     * branch when `createBranchFrom` is given.
     */
    async writeFile(target: RepositoryTarget, params: WriteFileParams): Promise<void> {
        const { codeRepository, repositoryName } = target

        switch (codeRepository.provider) {
            case CodeRepositoryProvider.GITHUB:
                return this.writeFileGithub(target, params)
            case CodeRepositoryProvider.GITLAB:
                return this.writeFileGitlab(target, params)
            case CodeRepositoryProvider.AZURE_DEV_OPS:
                return this.writeFileAzure(target, params)
            default:
                throw this.unsupportedProvider(codeRepository, repositoryName)
        }
    }

    private async writeFileGithub({ codeRepository, repositoryName }: RepositoryTarget, { path, content, branch, message, existing, createBranchFrom }: WriteFileParams): Promise<void> {
        const githubClient = new GithubClient()
        const orgName = codeRepository.githubData?.organizationId
        const userName = codeRepository.githubData?.userName

        if (createBranchFrom && createBranchFrom !== branch) {
            const baseSha = await githubClient.getBranchCommitSha(codeRepository.accessToken, repositoryName, createBranchFrom, orgName, userName)
            await githubClient.createBranch({ accessToken: codeRepository.accessToken, orgName, userName, repositoryName, branchName: branch, sha: baseSha })
        }

        await githubClient.updateFileContent({
            accessToken: codeRepository.accessToken,
            orgName,
            userName,
            repositoryName,
            path,
            content,
            message,
            branch,
            sha: existing?.sha
        })
    }

    private async writeFileGitlab({ codeRepository, repositoryName }: RepositoryTarget, { path, content, branch, message, existing, createBranchFrom }: WriteFileParams): Promise<void> {
        this.ensureGitlabData(codeRepository)
        const gitlabClient = new GitlabClient(codeRepository.gitlabData!.url, codeRepository.accessToken)
        const projectId = encodeURIComponent(repositoryName)
        const mustCreateBranch = Boolean(createBranchFrom && createBranchFrom !== branch) && !(await gitlabClient.branchExists(projectId, branch))

        await gitlabClient.commitFiles(projectId, {
            branch,
            startBranch: mustCreateBranch ? createBranchFrom : undefined,
            commitMessage: message,
            actions: [{ action: existing ? "update" : "create", file_path: path, content }]
        })
    }

    private async writeFileAzure({ codeRepository, repositoryName }: RepositoryTarget, { path, content, branch, message, existing, createBranchFrom }: WriteFileParams): Promise<void> {
        this.ensureAzureData(codeRepository)
        const azureClient = new AzureDevOpsClient()
        const { organization, projectId } = codeRepository.azureData!

        const branchCommitId = await azureClient.getBranchCommitId(codeRepository.accessToken, organization, projectId, repositoryName, branch).catch(() => undefined)

        if (!branchCommitId && !createBranchFrom) {
            throw createBusinessException({
                code: "BRANCH_NOT_FOUND",
                message: `Branch "${branch}" not found on "${repositoryName}"`
            })
        }

        const baseCommitId = branchCommitId || (await azureClient.getBranchCommitId(codeRepository.accessToken, organization, projectId, repositoryName, createBranchFrom!))

        await azureClient.pushFileEdit(codeRepository.accessToken, organization, projectId, repositoryName, {
            branchName: branch,
            baseCommitId,
            filePath: path,
            content,
            comment: message,
            changeType: existing ? "edit" : "add"
        })
    }

    private resolveRepositoryName(microfrontend: IMicrofrontend, codeRepository: ICodeRepository): string {
        const repository = microfrontend.codeRepository

        if (codeRepository.provider === CodeRepositoryProvider.GITHUB) {
            return repository?.name || repository?.repositoryId || ""
        }

        return repository?.repositoryId || repository?.name || ""
    }

    private unsupportedProvider(codeRepository: ICodeRepository, repositoryName: string) {
        return createBusinessException({
            code: "UNSUPPORTED_PROVIDER",
            message: `Unsupported code repository provider for "${repositoryName}": ${codeRepository.provider}`
        })
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

export default RepositoryFileService
