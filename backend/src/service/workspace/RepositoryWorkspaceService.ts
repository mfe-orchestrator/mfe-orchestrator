import fs from "node:fs/promises"
import path from "node:path"
import { fastify } from "../.."
import AzureDevOpsClient from "../../client/AzureDevOpsClient"
import GithubClient from "../../client/GithubClient"
import GitlabClient from "../../client/GitlabClient"
import { createBusinessException } from "../../errors/BusinessException"
import { EntityNotFoundError } from "../../errors/EntityNotFoundError"
import CodeRepository, { CodeRepositoryProvider, ICodeRepository } from "../../models/CodeRepositoryModel"
import Organization from "../../models/OrganizationModel"
import Project from "../../models/ProjectModel"
import BaseAuthorizedService from "../BaseAuthorizedService"
import { RepositoryFileService, repositoryNameFor } from "../RepositoryFileService"
import { GitCredentials, GitWorkingCopy } from "./GitWorkingCopy"
import { componentWorkspacePath, RepositoryComponent } from "./repositoryComponent"

/** Written inside `.git`, where it is neither tracked nor wiped by a reset, to tell when a copy was last used. */
const LAST_USED_MARKER = path.join(".git", "mfe-last-used")

/** The repository of a component, paired with the connection it belongs to. */
export interface WorkspaceTarget {
    component: RepositoryComponent
    codeRepository: ICodeRepository
    repositoryName: string
}

/** What cloning a repository needs: how it is linked and the connection it goes through, whoever links it. */
export type RepositoryLink = Pick<WorkspaceTarget, "codeRepository" | "repositoryName"> & { component: Pick<RepositoryComponent, "codeRepository"> }

export interface OpenedWorkspace {
    target: WorkspaceTarget
    workingCopy: GitWorkingCopy
    defaultBranch: string
}

const repositoryDataString = (component: Pick<RepositoryComponent, "codeRepository">, key: string): string | undefined => {
    const value = component.codeRepository?.repositoryData?.[key]
    return typeof value === "string" && value.startsWith("https://") ? value : undefined
}

/** The hosts the token of a connection may be sent to: its provider's, and nothing else. */
const allowedHostsFor = (codeRepository: ICodeRepository): string[] => {
    switch (codeRepository.provider) {
        case CodeRepositoryProvider.GITHUB:
            return ["github.com"]
        case CodeRepositoryProvider.GITLAB:
            return codeRepository.gitlabData?.url ? [new URL(codeRepository.gitlabData.url).hostname] : []
        case CodeRepositoryProvider.AZURE_DEV_OPS:
            return codeRepository.azureData ? ["dev.azure.com", `${codeRepository.azureData.organization}.visualstudio.com`.toLowerCase()] : []
        default:
            return []
    }
}

const onProviderHost = (candidate: string | undefined, codeRepository: ICodeRepository): URL | undefined => {
    if (!candidate) return undefined
    try {
        const url = new URL(candidate)
        return url.protocol === "https:" && allowedHostsFor(codeRepository).includes(url.hostname.toLowerCase()) ? url : undefined
    } catch {
        return undefined
    }
}

/**
 * The HTTPS clone URL of the repository of a microfrontend or a service, without credentials.
 *
 * The URL the provider gave at import time wins, but only on the provider's own host: those fields
 * are editable with the component, and the token goes wherever this URL points. Otherwise the
 * URL is computed from the connection.
 */
export const cloneUrlFor = ({ component, codeRepository, repositoryName }: RepositoryLink): string => {
    const stored = [
        component.codeRepository?.cloneUrlHttps,
        repositoryDataString(component, "http_url_to_repo"),
        repositoryDataString(component, "clone_url"),
        repositoryDataString(component, "remoteUrl")
    ]
        .map(candidate => onProviderHost(candidate, codeRepository))
        .find(Boolean)
    if (stored) {
        stored.username = ""
        stored.password = ""
        return stored.toString()
    }
    switch (codeRepository.provider) {
        case CodeRepositoryProvider.GITHUB:
            return `https://github.com/${codeRepository.githubData?.organizationId || codeRepository.githubData?.userName}/${repositoryName}.git`
        case CodeRepositoryProvider.GITLAB: {
            const projectPath = component.codeRepository?.gitlab?.path
            if (!projectPath || !codeRepository.gitlabData?.url) break
            return `${codeRepository.gitlabData.url.replace(/\/$/, "")}/${projectPath}.git`
        }
        case CodeRepositoryProvider.AZURE_DEV_OPS:
            if (!codeRepository.azureData) break
            return `https://dev.azure.com/${codeRepository.azureData.organization}/${codeRepository.azureData.projectId}/_git/${repositoryName}`
    }
    throw createBusinessException({ code: "WORKSPACE_NO_CLONE_URL", message: `Cannot tell the clone URL of "${repositoryName}"`, statusCode: 422 })
}

/** The basic-auth pair each provider accepts for git over HTTPS with the token the console holds. */
export const gitCredentialsFor = (codeRepository: ICodeRepository): GitCredentials => {
    switch (codeRepository.provider) {
        case CodeRepositoryProvider.GITHUB:
            return { username: "x-access-token", password: codeRepository.accessToken }
        case CodeRepositoryProvider.GITLAB:
            return { username: "oauth2", password: codeRepository.accessToken }
        default:
            return { username: "mfe-orchestrator", password: codeRepository.accessToken }
    }
}

/** Repositories refused for their size, by folder, until when. */
const refusedRepositories = new Map<string, number>()
const REFUSED_FOR_MS = 60 * 60 * 1000

const exists = async (target: string) =>
    fs
        .access(target)
        .then(() => true)
        .catch(() => false)

/**
 * The local clones of the repositories behind the microfrontends and the services, under `REPOSITORIES_FOLDER`.
 *
 * Laid out as `<org>/<project>/<microfrontend>` (`<service>.service` for a service) and reused across requests. It is a cache: every
 * use starts by resetting the copy to the remote, and deleting the folder only costs a new clone.
 */
export class RepositoryWorkspaceService extends BaseAuthorizedService {
    private get root(): string {
        return fastify.config.REPOSITORIES_FOLDER
    }

    /** Resolves the repository of a microfrontend or a service and the folder its working copy lives in. Clones nothing yet. */
    async open(component: RepositoryComponent): Promise<OpenedWorkspace> {
        await this.ensureAccessToProject(component.projectId)

        const link = component.codeRepository
        const codeRepository = link?.enabled && link.codeRepositoryId ? await CodeRepository.findById(link.codeRepositoryId) : null
        const repositoryName = codeRepository ? repositoryNameFor(link, codeRepository) : ""
        if (!codeRepository || !repositoryName) {
            throw createBusinessException({ code: "WORKSPACE_NO_REPOSITORY", message: `This ${component.kind} has no code repository connected`, statusCode: 422 })
        }
        // The component names its connection by id, and that id is editable: without this check a
        // member could borrow the connection, and the token, of another project.
        if (codeRepository.projectId?.toString() !== component.projectId.toString()) {
            throw createBusinessException({ code: "WORKSPACE_NO_REPOSITORY", message: "The code repository connection does not belong to this project", statusCode: 422 })
        }

        const target: WorkspaceTarget = { component, codeRepository, repositoryName }
        const dir = await this.pathFor(component)
        const workingCopy = new GitWorkingCopy(dir, cloneUrlFor(target), gitCredentialsFor(codeRepository))
        return { target, workingCopy, defaultBranch: await new RepositoryFileService(this.user).getDefaultBranch(target) }
    }

    async pathFor(component: Pick<RepositoryComponent, "kind" | "slug" | "projectId">): Promise<string> {
        const project = await Project.findById(component.projectId)
        const organization = project && (await Organization.findById(project.organizationId))
        if (!project || !organization) {
            throw new EntityNotFoundError(component.projectId.toString())
        }
        return componentWorkspacePath(this.root, { organization: { slug: organization.slug, id: organization._id.toString() }, project: { slug: project.slug, id: project._id.toString() } }, component)
    }

    /** Size of the repository as the provider reports it, undefined when it cannot tell. */
    async providerSizeBytes({ codeRepository, repositoryName }: Pick<WorkspaceTarget, "codeRepository" | "repositoryName">): Promise<number | undefined> {
        try {
            switch (codeRepository.provider) {
                case CodeRepositoryProvider.GITHUB: {
                    const repository = await new GithubClient().getRepository({
                        accessToken: codeRepository.accessToken,
                        orgName: codeRepository.githubData?.organizationId,
                        userName: codeRepository.githubData?.userName,
                        repositoryName
                    })
                    return repository.size * 1024
                }
                case CodeRepositoryProvider.AZURE_DEV_OPS: {
                    if (!codeRepository.azureData) return undefined
                    const repository = await new AzureDevOpsClient().getRepository(
                        codeRepository.accessToken,
                        codeRepository.azureData.organization,
                        codeRepository.azureData.projectId,
                        repositoryName
                    )
                    return repository.size
                }
                default:
                    return undefined
            }
        } catch {
            return undefined
        }
    }

    private tooBig() {
        return createBusinessException({
            code: "WORKSPACE_REPOSITORY_TOO_BIG",
            message: `The repository is bigger than ${fastify.config.REPOSITORIES_MAX_SIZE_MB} MB`,
            statusCode: 422
        })
    }

    /**
     * Prepares the working copy on `branch` and refuses repositories above the size limit.
     *
     * The size the provider reports is checked before the first clone: isomorphic-git holds the
     * whole packfile in memory, so a huge repository would take the process down before any check
     * on disk could run. The disk check after the clone covers providers that report no size, and a
     * refused repository is remembered for an hour so it is not cloned again on every request.
     */
    async prepare({ workingCopy, target }: { workingCopy: GitWorkingCopy; target: Pick<WorkspaceTarget, "codeRepository" | "repositoryName"> }, branch: string): Promise<string> {
        const maxBytes = fastify.config.REPOSITORIES_MAX_SIZE_MB * 1024 * 1024
        const refusedUntil = refusedRepositories.get(workingCopy.dir)
        if (refusedUntil && refusedUntil > Date.now()) throw this.tooBig()
        if (!(await exists(path.join(workingCopy.dir, ".git")))) {
            const reported = await this.providerSizeBytes(target)
            if (reported !== undefined && reported > maxBytes) {
                refusedRepositories.set(workingCopy.dir, Date.now() + REFUSED_FOR_MS)
                throw this.tooBig()
            }
        }
        const head = await workingCopy.prepare(branch)
        if ((await workingCopy.sizeInBytes()) > maxBytes) {
            await fs.rm(workingCopy.dir, { recursive: true, force: true })
            refusedRepositories.set(workingCopy.dir, Date.now() + REFUSED_FOR_MS)
            throw this.tooBig()
        }
        await fs.writeFile(path.join(workingCopy.dir, LAST_USED_MARKER), new Date().toISOString())
        return head
    }

    /** Opens a pull request (merge request on GitLab) from `sourceBranch` and returns its web URL. */
    async openPullRequest(
        { codeRepository, repositoryName, component }: WorkspaceTarget,
        request: { sourceBranch: string; targetBranch: string; title: string; description: string }
    ): Promise<string> {
        switch (codeRepository.provider) {
            case CodeRepositoryProvider.GITHUB:
                return new GithubClient().createPullRequest({
                    accessToken: codeRepository.accessToken,
                    orgName: codeRepository.githubData?.organizationId,
                    userName: codeRepository.githubData?.userName,
                    repositoryName,
                    head: request.sourceBranch,
                    base: request.targetBranch,
                    title: request.title,
                    body: request.description
                })
            case CodeRepositoryProvider.GITLAB:
                if (!codeRepository.gitlabData?.url) break
                return new GitlabClient(codeRepository.gitlabData.url, codeRepository.accessToken).createMergeRequest(
                    encodeURIComponent(component.codeRepository?.repositoryId || repositoryName),
                    request
                )
            case CodeRepositoryProvider.AZURE_DEV_OPS:
                if (!codeRepository.azureData) break
                return new AzureDevOpsClient().createPullRequest(codeRepository.accessToken, codeRepository.azureData.organization, codeRepository.azureData.projectId, repositoryName, request)
        }
        throw createBusinessException({ code: "UNSUPPORTED_PROVIDER", message: `Cannot open a pull request on ${codeRepository.provider}` })
    }
}

/**
 * Deletes the working copies not used for `days` days, then the folders left empty. Returns how
 * many copies went. A copy with no marker is judged by its folder's modification time.
 */
export const evictUnusedWorkspaces = async (root: string, days: number, now = Date.now()): Promise<number> => {
    if (!(await exists(root))) return 0
    const threshold = now - days * 24 * 60 * 60 * 1000
    let evicted = 0
    const children = async (dir: string) => (await fs.readdir(dir, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => path.join(dir, entry.name))

    for (const organizationDir of await children(root)) {
        for (const projectDir of await children(organizationDir)) {
            for (const copyDir of await children(projectDir)) {
                // Only working copies: a REPOSITORIES_FOLDER pointed at the wrong place must not be wiped.
                if (!(await exists(path.join(copyDir, ".git")))) continue
                const marker = path.join(copyDir, LAST_USED_MARKER)
                const lastUsed = (await fs.stat(marker).catch(() => fs.stat(copyDir))).mtimeMs
                if (lastUsed < threshold) {
                    await fs.rm(copyDir, { recursive: true, force: true })
                    evicted++
                }
            }
            if ((await fs.readdir(projectDir)).length === 0) await fs.rmdir(projectDir)
        }
        if ((await fs.readdir(organizationDir)).length === 0) await fs.rmdir(organizationDir)
    }
    return evicted
}

export default RepositoryWorkspaceService
