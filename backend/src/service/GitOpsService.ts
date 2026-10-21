import fs from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { isValidObjectId, Schema } from "mongoose"
import { stringify } from "yaml"
import { fastify } from ".."
import { createBusinessException } from "../errors/BusinessException"
import { ProjectNotFoundError } from "../errors/ProjectNotFoundError"
import CodeRepository, { ICodeRepository } from "../models/CodeRepositoryModel"
import Environment, { IEnvironment } from "../models/EnvironmentModel"
import Microfrontend, { ICodeRepositoryMicrofrontend, MicrofrontendKind } from "../models/MicrofrontendModel"
import Organization from "../models/OrganizationModel"
import Project, { IProjectGitOps } from "../models/ProjectModel"
import Service from "../models/ServiceModel"
import UserProject, { RoleInProject } from "../models/UserProjectModel"
import { variableMapModels } from "../models/VariableMapModel"
import { VariableMapKind } from "../types/VariableMapDTO"
import { NormalizedRepository } from "../utils/codeRepositoryUtils"
import { toObjectId } from "../utils/mongooseUtils"
import { RepositoryLockTimeoutError, withRepositoryLock } from "../utils/repositoryLock"
import { gitOpsWorkspacePath } from "../utils/workspacePaths"
import BaseAuthorizedService from "./BaseAuthorizedService"
import CodeRepositoryImportService from "./CodeRepositoryImportService"
import CodeRepositoryService from "./CodeRepositoryService"
import { applicationValuesPath, CHART_FILES, GitOpsApplication, isDeployable, renderApplicationValues } from "./gitops/applicationManifests"
import { RepositoryFileService, repositoryNameFor, toErrorMessage } from "./RepositoryFileService"
import { isValidRepositoryName } from "./RepositoryRenameService"
import { CodeRepositoryTarget, TemplateScaffoldService } from "./TemplateScaffoldService"
import { FileChangeAction, GitAuthor, GitWorkingCopy, ORCHESTRATOR_COMMITTER } from "./workspace/GitWorkingCopy"
import RepositoryWorkspaceService, { cloneUrlFor, gitCredentialsFor } from "./workspace/RepositoryWorkspaceService"

/** A repository as the settings screen names it: by the provider id, the backend resolves the rest */
export interface GitOpsRepositoryInput {
    codeRepositoryId?: string
    repositoryId?: string
    /** In place of repositoryId: a private repository with this name is created through the connection, and committed to */
    newRepositoryName?: string
}

/** The configuration repository at the top level; the applications one is optional, null or left out for none */
export interface GitOpsSettingsInput extends GitOpsRepositoryInput {
    enabled: boolean
    applications?: GitOpsRepositoryInput | null
}

/** The two repositories of GitOps: each has a working copy, and a lock, of its own */
type GitOpsRepositoryKind = "configuration" | "applications"

/** A map as it is committed: values in plaintext, one per environment */
export interface CommittedVariableMap {
    name: string
    /** As the API sends them or as the model stores them: the environment id is a string or an ObjectId */
    entries: Array<{ key: string; values?: Array<{ environmentId: unknown; value?: string }> }>
}

/** The folder of each kind inside the folder of the environment, named as its slug at the root of the repository */
export const GITOPS_FOLDER: Record<VariableMapKind, string> = { configMap: "configMaps", secret: "secrets" }

/** The Namespace manifest of every environment, in the folder of the environment */
export const NAMESPACE_FILE = "namespace.yaml"

/** Local branch the commit is made on before it is pushed onto the default one */
const GITOPS_BRANCH = "mfe-orchestrator-gitops"

const MANAGED_BY_LABEL = "app.kubernetes.io/managed-by"
const MANAGED_BY = "mfe-orchestrator"

/** A deploy waits this long for another one of the same project, not the 10 minutes an AI job may */
const LOCK_WAIT_MS = 30_000

/**
 * The slug is a folder and a branch of the repositories and, in lowercase, the namespace when none is set: a DNS
 * label in any case, as the console makes `DEV` or `PROD`. A slash or a dot would nest folders or be refused by
 * the working copy on every save, and the cluster refuses the rest.
 */
const ENVIRONMENT_SLUG = /^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/

/** What Kubernetes takes as the name of a namespace */
const NAMESPACE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/

export const environmentSlug = (environment: Pick<IEnvironment, "slug">): string => {
    if (!ENVIRONMENT_SLUG.test(environment.slug ?? "")) {
        throw createBusinessException({
            code: "GITOPS_ENVIRONMENT_SLUG_INVALID",
            message: `The environment slug "${environment.slug}" cannot be a folder of the GitOps repository and a namespace: up to 63 letters, digits and dashes, starting and ending with a letter or a digit`,
            details: { slug: environment.slug }
        })
    }
    return environment.slug
}

/** The namespace the environment is deployed to: the one set on it, its slug in lowercase when it has none */
export const environmentNamespace = (environment: Pick<IEnvironment, "slug" | "namespace">): string => {
    if (!environment.namespace) return environmentSlug(environment).toLowerCase()
    if (!NAMESPACE.test(environment.namespace)) {
        throw createBusinessException({
            code: "GITOPS_ENVIRONMENT_NAMESPACE_INVALID",
            message: `The namespace "${environment.namespace}" of the environment ${environment.slug} is not a Kubernetes namespace: up to 63 lowercase letters, digits and dashes, starting and ending with a letter or a digit`,
            details: { slug: environment.slug, namespace: environment.namespace }
        })
    }
    return environment.namespace
}

export const gitOpsFilePath = (kind: VariableMapKind, environment: Pick<IEnvironment, "slug">, name: string) => `${environmentSlug(environment)}/${GITOPS_FOLDER[kind]}/${name}.yaml`

export const namespaceFilePath = (environment: Pick<IEnvironment, "slug">) => `${environmentSlug(environment)}/${NAMESPACE_FILE}`

/**
 * The Kubernetes manifest of a map in one environment. A key with no value there is left out, as the
 * container would not get it. Secrets go as `data`, base64 encoded: encoded, not encrypted, so anyone who
 * reads the repository can decode them, which is what the project asked for by turning GitOps on. With
 * `namespace` the manifest says where it goes.
 */
export const renderManifest = (kind: VariableMapKind, map: CommittedVariableMap, environmentId: string, namespace?: string): string => {
    const data: Record<string, string> = {}
    for (const entry of map.entries) {
        const value = entry.values?.find(candidate => String(candidate.environmentId) === environmentId)?.value
        if (value !== undefined && value !== "") data[entry.key] = value
    }
    const metadata = { name: map.name, ...(namespace ? { namespace } : {}), labels: { [MANAGED_BY_LABEL]: MANAGED_BY } }
    const manifest =
        kind === "secret"
            ? { apiVersion: "v1", kind: "Secret", metadata, type: "Opaque", data: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, Buffer.from(value).toString("base64")])) }
            : { apiVersion: "v1", kind: "ConfigMap", metadata, data }
    return stringify(manifest)
}

/**
 * The Namespace of an environment, the one its config maps and secrets are meant to be applied in. Argo CD
 * never prunes nor deletes it: the applications of the environment run in it, and a configuration repository
 * emptied by mistake, or an Application deleted, must not take them down with it.
 */
export const renderNamespace = (environment: Pick<IEnvironment, "slug" | "namespace">): string =>
    stringify({
        apiVersion: "v1",
        kind: "Namespace",
        metadata: {
            name: environmentNamespace(environment),
            labels: { [MANAGED_BY_LABEL]: MANAGED_BY },
            annotations: { "argocd.argoproj.io/sync-options": "Prune=false,Delete=false" }
        }
    })

/** The first commit of a repository created for GitOps: it gives the repository the default branch the deploys start from */
const GITOPS_README: Record<GitOpsRepositoryKind, string> = {
    configuration: `# GitOps configuration

Committed by MFE Orchestrator every time environments of the project are deployed, for each of them:

- \`<environment>/namespace.yaml\`: the Namespace of the environment, named as set on it or as its slug in lowercase
- \`<environment>/configMaps/<name>.yaml\`: the ConfigMaps, in that namespace
- \`<environment>/secrets/<name>.yaml\`: the Secrets, in that namespace, values base64 encoded (not encrypted)

Do not edit these manifests here: the next deploy of the environment overwrites them.
`,
    applications: `# GitOps applications

One branch per environment, named as its slug, committed by MFE Orchestrator every time the environment is deployed:

- \`<application>.yaml\`: the Helm values of each backend service and frontend, with the version deployed
- \`microservice-chart/\`: the Helm chart they are installed with, written once: change it as the cluster needs

Point an Argo CD Application per application and environment at \`microservice-chart\` on the branch of the
environment, with \`../<application>.yaml\` as values file and the namespace of the environment as destination. Do not edit the values files: the next deploy overwrites them.
`
}

interface GitOpsFile {
    path: string
    action: FileChangeAction
    content?: string
    /** Written only when the branch does not have it yet: the team may change it afterwards */
    ifMissing?: boolean
}

/**
 * Pushes the files that differ from `branch` (the default one when left out) in one commit; a branch the remote
 * does not have yet starts from the default one. `prune` also deletes the files this console wrote that `files`
 * no longer accounts for, among the paths it accepts. Answers with the files that put the branch back as it was.
 */
type Commit = (message: string, files: GitOpsFile[], options?: { branch?: string; prune?: (path: string) => boolean }) => Promise<GitOpsFile[]>

/** The environment slug a manifest belongs to: the folder it is in at the root */
const environmentOfPath = (path: string): string => path.split("/")[0]

const KIND_FOLDERS = new Set(Object.values(GITOPS_FOLDER))

/** `<slug>/namespace.yaml`, or `<slug>/<kind folder>/<name>.yaml` */
const isConfigurationManifest = (path: string) => {
    const [, second, third, ...rest] = path.split("/")
    return rest.length === 0 && (third === undefined ? second === NAMESPACE_FILE : KIND_FOLDERS.has(second) && third.endsWith(".yaml"))
}

/** A map as it is read for a deploy: its id is how services and frontends attach it */
type DeployedMap = CommittedVariableMap & { _id: unknown }

/** What a deploy of one environment ships: its Namespace, and every config map and secret of the project as they are in it */
const environmentFiles = (environment: Pick<IEnvironment, "_id" | "slug" | "namespace">, maps: Record<VariableMapKind, DeployedMap[]>): GitOpsFile[] => {
    const namespace = environmentNamespace(environment)
    return [
        { path: namespaceFilePath(environment), action: "update", content: renderNamespace(environment) },
        ...(Object.keys(GITOPS_FOLDER) as VariableMapKind[]).flatMap(kind =>
            maps[kind].map(map => ({ path: gitOpsFilePath(kind, environment, map.name), action: "update" as const, content: renderManifest(kind, map, String(environment._id), namespace) }))
        )
    ]
}

/** Runs `next`; when it fails, `revert` puts back what was pushed for it, and the failure goes on as it was */
const revertingOnFailure = async <T>(next: () => Promise<T>, revert: () => Promise<void>): Promise<T> => {
    try {
        return await next()
    } catch (error) {
        await revert().catch(revertError => fastify.log.error({ error: toErrorMessage(revertError) }, "GitOps revert after a failed deploy did not go through"))
        throw error
    }
}

/**
 * Commits what the deploys of a project ship to the repositories picked in its settings. The configuration
 * one gets the Namespace of each deployed environment, `<environment>/namespace.yaml`, and its config maps
 * and secrets, `<environment>/configMaps/<name>.yaml` and `<environment>/secrets/<name>.yaml`, on its default
 * branch. The applications one, when there is one, gets on the branch of each deployed environment the Helm
 * values of every service and frontend, `<application>.yaml`, and the chart they are installed with. Saving a
 * map or an environment commits nothing: the repositories say what is deployed.
 *
 * The commits go before the deployments are saved, under the locks of the repositories: a deploy whose commits
 * do not go through does not start, and two deploys cannot land in the repositories in one order and in the
 * console in the other.
 */
export class GitOpsService extends BaseAuthorizedService {
    /**
     * The settings to store from what the screen sent; only an owner of the project picks where its secrets
     * go. Each repository must be reachable through one of the connections of the project, or is created
     * through one. Nothing is exported here: the next deploy of each environment is.
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
            return { enabled: false, codeRepository: project.gitOps?.codeRepository, applicationsCodeRepository: project.gitOps?.applicationsCodeRepository }
        }
        const codeRepository = await this.resolveRepository(projectIdObj, input, "configuration")
        const applicationsCodeRepository = input.applications ? await this.resolveRepository(projectIdObj, input.applications, "applications") : undefined
        return { enabled: true, codeRepository, applicationsCodeRepository }
    }

    private async resolveRepository(projectId: Schema.Types.ObjectId, input: GitOpsRepositoryInput, kind: GitOpsRepositoryKind): Promise<ICodeRepositoryMicrofrontend> {
        const creating = input.newRepositoryName !== undefined
        if (!isValidObjectId(input.codeRepositoryId) || (!creating && (typeof input.repositoryId !== "string" || !input.repositoryId))) {
            throw createBusinessException({ code: "GITOPS_REPOSITORY_REQUIRED", message: `Pick the connection and the ${kind} repository of GitOps, or the name of one to create` })
        }

        const codeRepository = await CodeRepository.findOne({ _id: toObjectId(input.codeRepositoryId!), projectId, isActive: true })
        if (!codeRepository) {
            throw createBusinessException({ code: "GITOPS_REPOSITORY_INVALID", message: "The code repository connection is not one of this project" })
        }
        const importService = new CodeRepositoryImportService(this.user)
        const repository = creating
            ? await this.createRepository(codeRepository, input.newRepositoryName, kind)
            : (await importService.fetchRepositories(new CodeRepositoryService(this.user), codeRepository)).find(candidate => candidate.repositoryId === input.repositoryId)
        if (!repository) {
            throw createBusinessException({ code: "GITOPS_REPOSITORY_INVALID", message: `The connection "${codeRepository.name}" cannot reach the repository ${input.repositoryId}` })
        }
        return importService.buildMicrofrontendCodeRepository(codeRepository, repository)
    }

    /**
     * Creates a private repository through the connection and makes its first commit, so that it has a default
     * branch to clone. A repository left behind by an attempt that failed afterwards comes back as
     * REPOSITORY_NAME_TAKEN: it is in the list of the connection then, and can be picked from there.
     */
    private async createRepository(codeRepository: ICodeRepository, name: unknown, kind: GitOpsRepositoryKind): Promise<NormalizedRepository> {
        const repositoryName = typeof name === "string" ? name.trim() : ""
        if (!isValidRepositoryName(repositoryName)) {
            throw createBusinessException({
                code: "INVALID_REPOSITORY_NAME",
                message: "A repository name takes letters, digits, '.', '_' and '-' (up to 100), starts with a letter or a digit, cannot end with '.' and cannot end with '.git' or '.atom'"
            })
        }

        // No pipeline of the console builds it: no template, and on GitHub no deploy secret
        const target = { enabled: true, createData: { name: repositoryName, private: true } } as CodeRepositoryTarget
        await new TemplateScaffoldService(this.user).createRepository(codeRepository, target, repositoryName, null, { deploySecret: false })
        const repository: NormalizedRepository = { repositoryId: target.repositoryId, name: target.name ?? repositoryName, cloneUrlHttps: target.cloneUrlHttps, cloneUrlSsh: target.cloneUrlSsh }

        const link = new CodeRepositoryImportService(this.user).buildMicrofrontendCodeRepository(codeRepository, repository)
        const cloneUrl = cloneUrlFor({ component: { codeRepository: link }, codeRepository, repositoryName: repositoryNameFor(link, codeRepository) })
        const workingCopy = new GitWorkingCopy(await fs.mkdtemp(path.join(tmpdir(), "mfe-gitops-")), cloneUrl, gitCredentialsFor(codeRepository))
        try {
            await workingCopy.initialize({ branch: "main", message: "Initialize GitOps repository", author: this.author(), files: [{ path: "README.md", content: GITOPS_README[kind] }] })
        } catch (error) {
            fastify.log.error({ error: toErrorMessage(error), repository: repository.name }, "GitOps repository created, its first commit failed")
            throw createBusinessException({
                code: "GITOPS_COMMIT_FAILED",
                message: `Nothing was saved: the repository ${repository.name} is created, but its first commit did not go through (${toErrorMessage(error)})`,
                statusCode: 502,
                details: { repository: repository.name, reason: toErrorMessage(error) }
            })
        } finally {
            await fs.rm(workingCopy.dir, { recursive: true, force: true })
        }
        return repository
    }

    /**
     * Runs `deploy` of `environmentIds` after committing what it ships, when GitOps is on for their project. In
     * the configuration repository, one commit with the Namespace, the config maps and the secrets of each of
     * them: the manifests this console wrote for them that no map accounts for any more go, and so do those of
     * environments that no longer exist; the other environments are left as their last deploy put them. In the
     * applications repository, one commit on the branch of each of them. When `deploy` fails after the pushes,
     * the files are committed back to what the branches held before, so the repositories do not say it is deployed.
     */
    async deploy<T>(environmentIds: (string | Schema.Types.ObjectId)[], deploy: () => Promise<T>): Promise<T> {
        // Checked before anything is pushed: deploy checks them again, too late for the repositories
        for (const environmentId of environmentIds) await this.ensureAccessToEnvironment(environmentId)
        const ids = new Set(environmentIds.map(String))
        const projectIds = [...new Set((await Environment.find({ _id: { $in: [...ids].map(toObjectId) } }, { projectId: 1 })).map(environment => String(environment.projectId)))]
        // One deploy is of one project; were it of several, each one's commits wrap the next
        const run = projectIds.reduceRight<() => Promise<T>>((next, projectId) => () => this.deployProject(toObjectId(projectId), ids, next), deploy)
        return run()
    }

    private async deployProject<T>(projectId: Schema.Types.ObjectId, environmentIds: Set<string>, deploy: () => Promise<T>): Promise<T> {
        const project = await Project.findById(projectId, { gitOps: 1 })
        const gitOps = project?.gitOps
        if (!gitOps?.enabled || !gitOps.codeRepository) return deploy()

        // With GitOps on, a deploy pushes to the provider with the token of the connection
        await this.ensureNotViewer(projectId, { code: "GITOPS_VIEWER_FORBIDDEN", message: "A viewer of the project cannot change what is committed to its GitOps repositories" })

        const environments = await Environment.find({ projectId }, { slug: 1, namespace: 1 })
        const deployed = environments.filter(environment => environmentIds.has(String(environment._id)))
        const maps = {} as Record<VariableMapKind, DeployedMap[]>
        // Read from the model, not through the API: a secret comes back decrypted only here
        for (const kind of Object.keys(GITOPS_FOLDER) as VariableMapKind[]) maps[kind] = await variableMapModels[kind].find({ projectId })

        const applicationsLink = gitOps.applicationsCodeRepository
        const withApplications = applicationsLink
            ? () => this.inRepository(projectId, "applications", applicationsLink, commit => this.commitApplications(projectId, deployed, maps, commit, deploy))
            : deploy

        return this.inRepository(projectId, "configuration", gitOps.codeRepository, async commit => {
            const deployedSlugs = new Set(deployed.map(environment => environment.slug))
            const existingSlugs = new Set(environments.map(environment => environment.slug))
            const message = `Deploy ${[...deployedSlugs].join(", ")}`
            const undo = await commit(
                message,
                deployed.flatMap(environment => environmentFiles(environment, maps)),
                { prune: path => isConfigurationManifest(path) && (deployedSlugs.has(environmentOfPath(path)) || !existingSlugs.has(environmentOfPath(path))) }
            )
            return revertingOnFailure(withApplications, async () => {
                if (undo.length > 0) await commit(`Revert: ${message.toLowerCase()}`, undo)
            })
        })
    }

    /**
     * Commits on the branch of each deployed environment the values of the services and frontends that can be
     * installed, and the chart when the branch has none, then runs `deploy`. A domain-scoped member writes the
     * values of their own applications only; the values of an application that no longer exists go.
     */
    private async commitApplications<T>(
        projectId: Schema.Types.ObjectId,
        deployed: Pick<IEnvironment, "_id" | "slug">[],
        maps: Record<VariableMapKind, DeployedMap[]>,
        commit: Commit,
        deploy: () => Promise<T>
    ): Promise<T> {
        const scope = await this.domainScopeFilter(projectId)
        const applications: GitOpsApplication[] = [...(await Service.find({ projectId, ...scope })), ...(await Microfrontend.find({ projectId, kind: MicrofrontendKind.FRONTEND, ...scope }))]
        const existingSlugs = new Set([...(await Service.find({ projectId }, { slug: 1 })), ...(await Microfrontend.find({ projectId }, { slug: 1 }))].map(application => application.slug))
        const mapNames = {
            configMaps: new Map(maps.configMap.map(map => [String(map._id), map.name])),
            secrets: new Map(maps.secret.map(map => [String(map._id), map.name]))
        }
        const isOrphanValues = (path: string) => !path.includes("/") && path.endsWith(".yaml") && !existingSlugs.has(path.slice(0, -".yaml".length))

        const pushed: Array<{ branch: string; undo: GitOpsFile[] }> = []
        const revert = async () => {
            for (const { branch, undo } of pushed.reverse()) {
                if (undo.length > 0) await commit(`Revert: deploy ${branch}`, undo, { branch })
            }
        }
        return revertingOnFailure(async () => {
            for (const environment of deployed) {
                const files: GitOpsFile[] = [
                    ...CHART_FILES.map(file => ({ ...file, action: "update" as const, ifMissing: true })),
                    ...applications.filter(isDeployable).map(application => ({
                        path: applicationValuesPath(application),
                        action: "update" as const,
                        content: renderApplicationValues(application, environment, mapNames)
                    }))
                ]
                pushed.push({ branch: environment.slug, undo: await commit(`Deploy ${environment.slug}`, files, { branch: environment.slug, prune: isOrphanValues }) })
            }
            return deploy()
        }, revert)
    }

    /** The connection a GitOps repository is linked through: the one Argo CD is pointed at reads it with credentials of its own */
    async connectionOf(link: ICodeRepositoryMicrofrontend, projectId: Schema.Types.ObjectId): Promise<ICodeRepository> {
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
     * Runs `task` holding the lock of the project's working copy of one GitOps repository, brought up to its
     * default branch. `commit` writes the files that actually change and pushes one commit onto a branch, never
     * forced. The copy is deleted afterwards: it holds the secrets in plaintext, and the database keeps them encrypted.
     */
    private async inRepository<T>(projectId: Schema.Types.ObjectId, kind: GitOpsRepositoryKind, link: ICodeRepositoryMicrofrontend, task: (commit: Commit) => Promise<T>): Promise<T> {
        const codeRepository = await this.connectionOf(link, projectId)
        const repositoryName = repositoryNameFor(link, codeRepository)
        const target = { component: { codeRepository: link }, codeRepository, repositoryName }
        const workingCopy = new GitWorkingCopy(await this.workspacePath(projectId, kind), cloneUrlFor(target), gitCredentialsFor(codeRepository))
        const failed = (error: unknown) => {
            fastify.log.error({ error: toErrorMessage(error), repository: repositoryName }, "GitOps commit failed")
            return createBusinessException({
                code: "GITOPS_COMMIT_FAILED",
                message: `Nothing was deployed: the commit to ${repositoryName} did not go through (${toErrorMessage(error)})`,
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
                        let checkedOut = defaultBranch

                        const commit: Commit = async (message, files, options) => {
                            const branch = options?.branch ?? defaultBranch
                            if (branch !== checkedOut) {
                                // A branch the remote does not have yet starts from the default one
                                const exists = branch === defaultBranch || (await workingCopy.hasRemoteBranch(branch).catch(error => Promise.reject(failed(error))))
                                await workingCopy.prepare(exists ? branch : defaultBranch).catch(error => Promise.reject(failed(error)))
                                checkedOut = branch
                            }
                            const changed: GitOpsFile[] = []
                            const undo: GitOpsFile[] = []
                            const orphans = options?.prune ? await this.orphans(workingCopy, files, options.prune).catch(error => Promise.reject(failed(error))) : []
                            for (const file of [...files, ...orphans]) {
                                const current = await workingCopy.readHeadFile(file.path)
                                if (file.ifMissing && current !== undefined) continue
                                if (file.action === "delete" ? current === undefined : current === file.content) continue
                                changed.push(file)
                                undo.push(current === undefined ? { path: file.path, action: "delete" } : { path: file.path, action: "update", content: current })
                            }
                            if (changed.length === 0) return []
                            await workingCopy.commitAndPush({ branch: GITOPS_BRANCH, pushTo: branch, message, author: this.author(), files: changed }).catch(error => Promise.reject(failed(error)))
                            // The local branch still sits on the commit before the push: the next commit, a revert, compares against the pushed one
                            await workingCopy.prepare(branch).catch(error => Promise.reject(failed(error)))
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
                throw createBusinessException({ code: "GITOPS_BUSY", message: "Another deploy is being committed to the GitOps repository: try again in a moment", statusCode: 409 })
            }
            // Errors of git and of the provider are already GITOPS_COMMIT_FAILED; those of the task, the deploy itself, go as they are
            throw error
        }
    }

    /** The files this console wrote, among those `scope` accepts, that an export no longer produces */
    private async orphans(workingCopy: GitWorkingCopy, exported: GitOpsFile[], scope: (path: string) => boolean): Promise<GitOpsFile[]> {
        const kept = new Set(exported.map(file => file.path))
        const orphans: GitOpsFile[] = []
        for (const path of await workingCopy.listFiles()) {
            if (kept.has(path) || !scope(path)) continue
            // A file someone else put there is left alone: the manifests and the values files carry the label
            if ((await workingCopy.readHeadFile(path))?.includes(`${MANAGED_BY_LABEL}: ${MANAGED_BY}`)) orphans.push({ path, action: "delete" })
        }
        return orphans
    }

    /** The configuration copy keeps the folder it always had; the applications one sits next to it */
    private async workspacePath(projectId: Schema.Types.ObjectId, kind: GitOpsRepositoryKind): Promise<string> {
        const project = await Project.findById(projectId, { slug: 1, organizationId: 1 })
        const organization = project && (await Organization.findById(project.organizationId, { slug: 1 }))
        if (!project || !organization) throw new ProjectNotFoundError(String(projectId))
        const configuration = gitOpsWorkspacePath(fastify.config.REPOSITORIES_FOLDER, {
            organization: { slug: organization.slug, id: String(organization._id) },
            project: { slug: project.slug, id: String(project._id) }
        })
        return kind === "configuration" ? configuration : path.join(path.dirname(configuration), "applications.gitops")
    }

    /** Where the secrets of the project are pushed in plaintext, and who deploys them from there, is up to its owners and the organization administrators */
    async ensureOwner(projectId: Schema.Types.ObjectId, organizationId: Schema.Types.ObjectId) {
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
