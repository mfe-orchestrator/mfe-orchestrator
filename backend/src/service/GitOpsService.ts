import fs from "node:fs/promises"
import { isValidObjectId, Schema } from "mongoose"
import { stringify } from "yaml"
import { fastify } from ".."
import { createBusinessException } from "../errors/BusinessException"
import { ProjectNotFoundError } from "../errors/ProjectNotFoundError"
import CodeRepository, { ICodeRepository } from "../models/CodeRepositoryModel"
import Environment, { IEnvironment } from "../models/EnvironmentModel"
import { ICodeRepositoryMicrofrontend } from "../models/MicrofrontendModel"
import Organization from "../models/OrganizationModel"
import Project, { IProjectGitOps } from "../models/ProjectModel"
import UserProject, { RoleInProject } from "../models/UserProjectModel"
import { variableMapModels } from "../models/VariableMapModel"
import { VariableMapKind } from "../types/VariableMapDTO"
import { toObjectId } from "../utils/mongooseUtils"
import { RepositoryLockTimeoutError, withRepositoryLock } from "../utils/repositoryLock"
import { gitOpsWorkspacePath } from "../utils/workspacePaths"
import BaseAuthorizedService from "./BaseAuthorizedService"
import CodeRepositoryImportService from "./CodeRepositoryImportService"
import CodeRepositoryService from "./CodeRepositoryService"
import { RepositoryFileService, repositoryNameFor, toErrorMessage } from "./RepositoryFileService"
import { FileChangeAction, GitAuthor, GitWorkingCopy, ORCHESTRATOR_COMMITTER } from "./workspace/GitWorkingCopy"
import RepositoryWorkspaceService, { cloneUrlFor, gitCredentialsFor } from "./workspace/RepositoryWorkspaceService"

/** What the settings screen sends: the repository is named by the provider id, the backend resolves the rest */
export interface GitOpsSettingsInput {
    enabled: boolean
    codeRepositoryId?: string
    repositoryId?: string
}

/** A map as it is committed: values in plaintext, one per environment */
export interface CommittedVariableMap {
    name: string
    /** As the API sends them or as the model stores them: the environment id is a string or an ObjectId */
    entries: Array<{ key: string; values?: Array<{ environmentId: unknown; value?: string }> }>
}

/** The folder of each kind at the root of the repository, then one folder per environment slug */
export const GITOPS_FOLDER: Record<VariableMapKind, string> = { configMap: "configMaps", secret: "secrets" }

const KIND_LABEL: Record<VariableMapKind, string> = { configMap: "config map", secret: "secret" }

/** Local branch the commit is made on before it is pushed onto the default one */
const GITOPS_BRANCH = "mfe-orchestrator-gitops"

const MANAGED_BY_LABEL = "app.kubernetes.io/managed-by"
const MANAGED_BY = "mfe-orchestrator"

/** A map save waits this long for another one on the same project, not the 10 minutes an AI job may */
const LOCK_WAIT_MS = 30_000

/** One folder of the repository: a slug with a slash or a dot would nest folders or be refused by the working copy on every save */
const ENVIRONMENT_FOLDER = /^[a-z0-9][a-z0-9-]*$/

export const gitOpsFilePath = (kind: VariableMapKind, environment: Pick<IEnvironment, "slug">, name: string) => {
    if (!ENVIRONMENT_FOLDER.test(environment.slug ?? "")) {
        throw createBusinessException({
            code: "GITOPS_ENVIRONMENT_SLUG_INVALID",
            message: `The environment slug "${environment.slug}" cannot be a folder of the GitOps repository: lowercase letters, digits and dashes only`,
            details: { slug: environment.slug }
        })
    }
    return `${GITOPS_FOLDER[kind]}/${environment.slug}/${name}.yaml`
}

/**
 * The Kubernetes manifest of a map in one environment. A key with no value there is left out, as the
 * container would not get it. Secrets go as `stringData`: the values are in plaintext in the repository,
 * which is what the project asked for by turning GitOps on.
 */
export const renderManifest = (kind: VariableMapKind, map: CommittedVariableMap, environmentId: string): string => {
    const data: Record<string, string> = {}
    for (const entry of map.entries) {
        const value = entry.values?.find(candidate => String(candidate.environmentId) === environmentId)?.value
        if (value !== undefined && value !== "") data[entry.key] = value
    }
    const metadata = { name: map.name, labels: { [MANAGED_BY_LABEL]: MANAGED_BY } }
    const manifest = kind === "secret" ? { apiVersion: "v1", kind: "Secret", metadata, type: "Opaque", stringData: data } : { apiVersion: "v1", kind: "ConfigMap", metadata, data }
    return stringify(manifest)
}

interface GitOpsFile {
    path: string
    action: FileChangeAction
    content?: string
}

/**
 * Pushes the files that differ from the default branch in one commit; `prune` also deletes the manifests this
 * console wrote that `files` no longer accounts for. Answers with the files that put the branch back as it was.
 */
type Commit = (message: string, files: GitOpsFile[], options?: { prune?: boolean }) => Promise<GitOpsFile[]>

/** One change of a map, worked out while the repository is locked so that no other save of the project interleaves */
export interface VariableMapChange<T> {
    before: CommittedVariableMap | null
    /** null deletes the map; undefined leaves the repository alone, as a change of the description does */
    after: CommittedVariableMap | null | undefined
    /** The database write of the same change */
    write: () => Promise<T>
}

/** The files of one map in every environment: written for `after`, deleted for a `before` it no longer has the name of */
const mapFiles = (kind: VariableMapKind, environments: Pick<IEnvironment, "_id" | "slug">[], before: { name: string } | null, after: CommittedVariableMap | null): GitOpsFile[] =>
    environments.flatMap(environment => [
        ...(after ? [{ path: gitOpsFilePath(kind, environment, after.name), action: "update" as const, content: renderManifest(kind, after, String(environment._id)) }] : []),
        ...(before && before.name !== after?.name ? [{ path: gitOpsFilePath(kind, environment, before.name), action: "delete" as const }] : [])
    ])

/**
 * Commits the config maps and the secrets of a project to the repository picked in its settings, as
 * `configMaps/<environment>/<name>.yaml` and `secrets/<environment>/<name>.yaml`.
 *
 * A map is committed before it is written to the database, both under one lock: a change that cannot be
 * committed is not saved, and two saves cannot land in the repository in one order and in the database in
 * the other.
 */
export class GitOpsService extends BaseAuthorizedService {
    /**
     * The settings to store from what the screen sent; only an owner of the project picks where its secrets
     * go. The repository must be reachable through one of the connections of the project. Saving them turned
     * on exports every map the project has, removing the manifests of the maps and environments that are gone,
     * which is also how a push that does not go through is caught before saving.
     */
    async resolveSettings(projectId: string | Schema.Types.ObjectId, input: GitOpsSettingsInput): Promise<IProjectGitOps> {
        const projectIdObj = toObjectId(projectId)
        await this.ensureAccessToProject(projectIdObj)
        const project = await Project.findById(projectIdObj)
        if (!project) throw new ProjectNotFoundError(String(projectId))
        await this.ensureOwner(projectIdObj, project.organizationId)

        if (typeof input?.enabled !== "boolean") {
            throw createBusinessException({ code: "GITOPS_SETTINGS_INVALID", message: "gitOps.enabled must be true or false" })
        }
        if (!input.enabled) {
            return { enabled: false, codeRepository: project.gitOps?.codeRepository }
        }
        if (!isValidObjectId(input.codeRepositoryId) || typeof input.repositoryId !== "string" || !input.repositoryId) {
            throw createBusinessException({ code: "GITOPS_REPOSITORY_REQUIRED", message: "Pick the connection and the repository the config maps and secrets are committed to" })
        }

        const codeRepository = await CodeRepository.findOne({ _id: toObjectId(input.codeRepositoryId!), projectId: projectIdObj, isActive: true })
        if (!codeRepository) {
            throw createBusinessException({ code: "GITOPS_REPOSITORY_INVALID", message: "The code repository connection is not one of this project" })
        }
        const importService = new CodeRepositoryImportService(this.user)
        const repositories = await importService.fetchRepositories(new CodeRepositoryService(this.user), codeRepository)
        const repository = repositories.find(candidate => candidate.repositoryId === input.repositoryId)
        if (!repository) {
            throw createBusinessException({ code: "GITOPS_REPOSITORY_INVALID", message: `The connection "${codeRepository.name}" cannot reach the repository ${input.repositoryId}` })
        }

        const link = importService.buildMicrofrontendCodeRepository(codeRepository, repository)
        await this.inRepository(projectIdObj, link, codeRepository, commit => this.exportAll(projectIdObj, commit))
        return { enabled: true, codeRepository: link }
    }

    /**
     * Saves one map: `prepare` reads and checks it and says what changes, then the change is committed and
     * written to the database. With GitOps on all of it runs under the lock of the project's repository, so
     * two saves can neither read the same stale map nor land in the repository and in the database in
     * different orders. With GitOps off only `prepare` and the write run. When the write fails after the
     * push, the files are committed back to what the branch held before, so the repository does not keep it.
     */
    async saveVariableMap<T>(projectId: Schema.Types.ObjectId, kind: VariableMapKind, prepare: () => Promise<VariableMapChange<T>>): Promise<T> {
        const project = await Project.findById(projectId, { gitOps: 1 })
        const link = project?.gitOps?.enabled ? project.gitOps.codeRepository : undefined
        if (!link) return (await prepare()).write()

        // With GitOps on, a map save pushes to the provider with the token of the connection
        await this.ensureNotViewer(projectId, { code: "GITOPS_VIEWER_FORBIDDEN", message: "A viewer of the project cannot change what is committed to its GitOps repository" })

        return this.inRepository(projectId, link, await this.connectionOf(link, projectId), async commit => {
            const { before, after, write } = await prepare()
            if (after === undefined) return write()

            const environments = await Environment.find({ projectId }, { slug: 1 })
            const verb = !after ? "Delete" : !before ? "Create" : before.name !== after.name ? "Rename" : "Update"
            const name = before && after && before.name !== after.name ? `${before.name} to ${after.name}` : (after ?? before)!.name
            const undo = await commit(`${verb} ${KIND_LABEL[kind]} ${name}`, mapFiles(kind, environments, before, after))
            try {
                return await write()
            } catch (error) {
                if (undo.length > 0) {
                    await commit(`Revert: ${verb.toLowerCase()} ${KIND_LABEL[kind]} ${name}`, undo).catch(revertError =>
                        fastify.log.error({ error: toErrorMessage(revertError) }, "GitOps revert after a failed save did not go through")
                    )
                }
                throw error
            }
        })
    }

    /**
     * Aligns the repository after the environments of the project changed: a new one gets every map, the
     * folder of a deleted or renamed one goes. The environments are already saved by then, so a failure says so.
     */
    async syncEnvironments(projectId: string | Schema.Types.ObjectId): Promise<void> {
        const projectIdObj = toObjectId(projectId)
        const project = await Project.findById(projectIdObj, { gitOps: 1 })
        const link = project?.gitOps?.enabled ? project.gitOps.codeRepository : undefined
        if (!link) return

        try {
            // Turned down for a viewer after the environment is saved: it still says the repository is behind
            await this.ensureNotViewer(projectIdObj, { code: "GITOPS_VIEWER_FORBIDDEN", message: "a viewer cannot change what is committed to the GitOps repository" })
            await this.inRepository(projectIdObj, link, await this.connectionOf(link, projectIdObj), commit => this.exportAll(projectIdObj, commit))
        } catch (error) {
            throw createBusinessException({
                code: "GITOPS_SYNC_FAILED",
                message: `The environments are saved, but the GitOps repository is not aligned: save the GitOps settings again to export (${toErrorMessage(error)})`,
                statusCode: 502,
                details: { reason: toErrorMessage(error) }
            })
        }
    }

    /**
     * Every config map and secret of the project in one commit, and the deletion of the manifests this
     * console wrote that no map or environment accounts for any more.
     */
    private async exportAll(projectId: Schema.Types.ObjectId, commit: Commit) {
        const environments = await Environment.find({ projectId }, { slug: 1 })
        const files: GitOpsFile[] = []
        for (const kind of Object.keys(GITOPS_FOLDER) as VariableMapKind[]) {
            // Read from the model, not through the API: a secret comes back decrypted only here
            for (const map of await variableMapModels[kind].find({ projectId })) {
                files.push(...mapFiles(kind, environments, null, map))
            }
        }
        await commit("Export config maps and secrets", files, { prune: true })
    }

    private async connectionOf(link: ICodeRepositoryMicrofrontend, projectId: Schema.Types.ObjectId): Promise<ICodeRepository> {
        const codeRepository = await CodeRepository.findOne({ _id: link.codeRepositoryId, projectId })
        if (!codeRepository) {
            throw createBusinessException({
                code: "GITOPS_REPOSITORY_INVALID",
                message: "The code repository connection GitOps commits through no longer exists: pick another one in the settings",
                statusCode: 422
            })
        }
        return codeRepository
    }

    /**
     * Runs `task` holding the lock of the project's GitOps copy, brought up to the default branch. `commit`
     * writes the files that actually change and pushes one commit onto the default branch, never forced.
     * The copy is deleted afterwards: it holds the secrets in plaintext, and the database keeps them encrypted.
     */
    private async inRepository<T>(projectId: Schema.Types.ObjectId, link: ICodeRepositoryMicrofrontend, codeRepository: ICodeRepository, task: (commit: Commit) => Promise<T>): Promise<T> {
        const repositoryName = repositoryNameFor(link, codeRepository)
        const target = { component: { codeRepository: link }, codeRepository, repositoryName }
        const workingCopy = new GitWorkingCopy(await this.workspacePath(projectId), cloneUrlFor(target), gitCredentialsFor(codeRepository))
        const failed = (error: unknown) => {
            fastify.log.error({ error: toErrorMessage(error), repository: repositoryName }, "GitOps commit failed")
            return createBusinessException({
                code: "GITOPS_COMMIT_FAILED",
                message: `Nothing was saved: the commit to ${repositoryName} did not go through (${toErrorMessage(error)})`,
                statusCode: 502,
                details: { repository: repositoryName, reason: toErrorMessage(error) }
            })
        }

        try {
            return await withRepositoryLock(
                workingCopy.dir,
                async () => {
                    try {
                        const defaultBranch = await new RepositoryFileService(this.user).getDefaultBranch(target).catch(error => Promise.reject(failed(error)))
                        await new RepositoryWorkspaceService(this.user).prepare({ workingCopy, target }, defaultBranch).catch(error => Promise.reject(failed(error)))

                        const commit: Commit = async (message, files, options) => {
                            const changed: GitOpsFile[] = []
                            const undo: GitOpsFile[] = []
                            const orphans = options?.prune ? await this.orphans(workingCopy, files).catch(error => Promise.reject(failed(error))) : []
                            for (const file of [...files, ...orphans]) {
                                const current = await workingCopy.readHeadFile(file.path)
                                if (file.action === "delete" ? current === undefined : current === file.content) continue
                                changed.push(file)
                                undo.push(current === undefined ? { path: file.path, action: "delete" } : { path: file.path, action: "update", content: current })
                            }
                            if (changed.length === 0) return []
                            await workingCopy
                                .commitAndPush({ branch: GITOPS_BRANCH, pushTo: defaultBranch, message, author: this.author(), files: changed })
                                .catch(error => Promise.reject(failed(error)))
                            // The local branch still sits on the commit before the push: the next commit, a revert, compares against the pushed one
                            await workingCopy.prepare(defaultBranch).catch(error => Promise.reject(failed(error)))
                            return undo
                        }
                        return await task(commit)
                    } finally {
                        await fs.rm(workingCopy.dir, { recursive: true, force: true })
                    }
                },
                { waitMs: LOCK_WAIT_MS }
            )
        } catch (error) {
            if (error instanceof RepositoryLockTimeoutError) {
                throw createBusinessException({ code: "GITOPS_BUSY", message: "Another change is being committed to the GitOps repository: try again in a moment", statusCode: 409 })
            }
            // Errors of git and of the provider are already GITOPS_COMMIT_FAILED; those of the task, the database write, go as they are
            throw error
        }
    }

    /** The manifests under the GitOps folders that this console wrote and an export no longer produces */
    private async orphans(workingCopy: GitWorkingCopy, exported: GitOpsFile[]): Promise<GitOpsFile[]> {
        const kept = new Set(exported.map(file => file.path))
        const folders = Object.values(GITOPS_FOLDER).map(folder => `${folder}/`)
        const orphans: GitOpsFile[] = []
        for (const path of await workingCopy.listFiles()) {
            if (kept.has(path) || !path.endsWith(".yaml") || !folders.some(folder => path.startsWith(folder))) continue
            // A manifest someone else put there is left alone
            if ((await workingCopy.readHeadFile(path))?.includes(`${MANAGED_BY_LABEL}: ${MANAGED_BY}`)) orphans.push({ path, action: "delete" })
        }
        return orphans
    }

    private async workspacePath(projectId: Schema.Types.ObjectId): Promise<string> {
        const project = await Project.findById(projectId, { slug: 1, organizationId: 1 })
        const organization = project && (await Organization.findById(project.organizationId, { slug: 1 }))
        if (!project || !organization) throw new ProjectNotFoundError(String(projectId))
        return gitOpsWorkspacePath(fastify.config.REPOSITORIES_FOLDER, {
            organization: { slug: organization.slug, id: String(organization._id) },
            project: { slug: project.slug, id: String(project._id) }
        })
    }

    /** Where the secrets of the project are pushed in plaintext is up to its owners and the organization administrators */
    private async ensureOwner(projectId: Schema.Types.ObjectId, organizationId: Schema.Types.ObjectId) {
        const user = this.getUser()
        // An API key has no person behind it to be an owner
        if (user && !this.user?.apiKeyId) {
            const membership = await UserProject.findOne({ userId: user._id, projectId, invitationToken: null })
            if (membership?.role === RoleInProject.OWNER || (await this.isOrganizationAdmin(organizationId))) return
        }
        throw createBusinessException({ code: "GITOPS_OWNER_REQUIRED", message: "Only an owner of the project can change its GitOps settings", statusCode: 403 })
    }

    private author(): GitAuthor {
        const user = this.getUser()
        // An API key has no person behind it: the orchestrator signs
        if (!user || this.user?.apiKeyId) return ORCHESTRATOR_COMMITTER
        return { name: [user.name, user.surname].filter(Boolean).join(" ") || user.email, email: user.email }
    }
}

export default GitOpsService
