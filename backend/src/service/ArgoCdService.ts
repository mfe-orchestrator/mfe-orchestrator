import { Schema } from "mongoose"
import { fastify } from ".."
import ArgoCdClient, { ArgoCdResource } from "../client/ArgoCdClient"
import GitlabClient from "../client/GitlabClient"
import { BusinessException, createBusinessException } from "../errors/BusinessException"
import { ProjectNotFoundError } from "../errors/ProjectNotFoundError"
import CodeRepository, { CodeRepositoryProvider, ICodeRepository } from "../models/CodeRepositoryModel"
import Environment from "../models/EnvironmentModel"
import Microfrontend, { ICodeRepositoryMicrofrontend, MicrofrontendKind } from "../models/MicrofrontendModel"
import Project, { IArgoCdError, IArgoCdRepositoryCredential, IArgoCdRepositoryRegistration, IProjectArgoCd, IProjectGitOps } from "../models/ProjectModel"
import Service from "../models/ServiceModel"
import { toObjectId } from "../utils/mongooseUtils"
import { SECRET_PLACEHOLDER } from "../utils/secretCrypto"
import BaseAuthorizedService from "./BaseAuthorizedService"
import CodeRepositoryService from "./CodeRepositoryService"
import GitOpsService, { environmentNamespace, environmentSlug } from "./GitOpsService"
import { GitOpsApplication, isDeployable } from "./gitops/applicationManifests"
import { APPLICATION_LABEL, appProjectName, buildApplicationSets, buildArgoCdState, COMPONENT_LABEL, clashingName, PROJECT_ID_LABEL } from "./gitops/argoCdManifests"
import { repositoryNameFor, toErrorMessage } from "./RepositoryFileService"
import { cloneUrlFor, gitCredentialsFor } from "./workspace/RepositoryWorkspaceService"

/** The token and the repository token come back as the placeholder, or not at all, when they are not retyped */
export interface ArgoCdInitializeInput {
    url: string
    token?: string
    /** Read-only token of GitHub or Azure DevOps, for the repositories GitLab does not hold */
    repositoryToken?: string
}

type ArgoCdRepositoryKind = "configuration" | "applications"

type ArgoCdRepositories = NonNullable<IProjectArgoCd["repositories"]>

/** What the settings screen shows of Argo CD: never a credential */
export interface ArgoCdStatusDTO {
    url?: string
    /** A URL and a token are stored: the token may be left out of the next initialization to the same URL */
    configured: boolean
    initializedAt?: Date
    lastError?: IArgoCdError
    /** Why the last deploy did not align the ApplicationSets of the applications */
    alignError?: IArgoCdError
    repositories: Partial<Record<ArgoCdRepositoryKind, { source: IArgoCdRepositoryCredential["source"] }>>
    /** Some repository is not on GitLab: Argo CD reads it with the token the owner pastes */
    needsRepositoryToken: boolean
    /** The providers that token is for, so the screen can say how to create it */
    repositoryTokenProviders: CodeRepositoryProvider[]
    /** A pasted token is stored for the stored URL: it may be left out of the next initialization to it */
    repositoryTokenStored: boolean
    /** The user is an owner of the project or an administrator of its organization */
    canInitialize: boolean
}

/** Every initialization creates one per GitLab repository, under this name */
const DEPLOY_TOKEN_NAME = "mfe-orchestrator-argocd"

/** An initialization that has not ended after this long is taken for one that died: the next one may start */
const LEASE_MS = 5 * 60 * 1000

/** The lease of a run: the time it was last renewed, which every save of the run matches on */
interface Lease {
    at: Date
}

/** A deploy token created for this initialization, revoked when Argo CD never got it */
interface PendingDeployToken {
    gitlab: GitlabClient
    gitlabProjectId: number
    id: number
}

interface RepositoryTarget {
    kind: ArgoCdRepositoryKind
    link: ICodeRepositoryMicrofrontend
    connection: ICodeRepository
    repoUrl: string
    /** The AppProject the credentials are scoped to; global when unset */
    argoProject?: string
}

const retyped = (value: unknown): string | undefined => (typeof value === "string" && value.trim() && value !== SECRET_PLACEHOLDER ? value.trim() : undefined)

/** The base URL of Argo CD as it is stored: https, or http where the installation allows it; no credentials, no trailing slash */
const normalizeUrl = (value: unknown): string => {
    const invalid = createBusinessException({ code: "ARGOCD_URL_INVALID", message: "The URL of Argo CD must be an https address, such as https://argocd.example.com" })
    let url: URL
    try {
        url = new URL(String(value ?? "").trim())
    } catch {
        throw invalid
    }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw invalid
    if (url.protocol === "http:" && !fastify.config.ARGOCD_ALLOW_INSECURE_HTTP) {
        throw createBusinessException({
            code: "ARGOCD_URL_INSECURE",
            message:
                "The URL of Argo CD must be https: the token and the repository credentials would cross the network in the clear. ARGOCD_ALLOW_INSECURE_HTTP=true allows http, for a local cluster only"
        })
    }
    return `${url.origin}${url.pathname}`.replace(/\/+$/, "")
}

/** The GitOps repositories of the project, configuration first; none while GitOps is off */
const linksOf = (gitOps?: IProjectGitOps): Array<[ArgoCdRepositoryKind, ICodeRepositoryMicrofrontend]> => {
    if (!gitOps?.enabled) return []
    const links: Array<[ArgoCdRepositoryKind, ICodeRepositoryMicrofrontend | undefined]> = [
        ["configuration", gitOps.codeRepository],
        ["applications", gitOps.applicationsCodeRepository]
    ]
    return links.filter((entry): entry is [ArgoCdRepositoryKind, ICodeRepositoryMicrofrontend] => Boolean(entry[1]))
}

/** GitLab takes the numeric id or the full path of a project, never a bare name */
const gitlabAddressOf = (link: ICodeRepositoryMicrofrontend, codeRepository: ICodeRepository): string => {
    const groupPath = codeRepository.gitlabData?.groupPath
    return encodeURIComponent(link.repositoryId || link.gitlab?.path || (groupPath ? `${groupPath}/${link.name}` : link.name))
}

/**
 * The token pasted for GitHub and Azure DevOps is one: whichever repository stored it, the other may use it.
 * Only for the Argo CD it was handed to: another URL may be another server, and it is asked for again.
 */
const storedRepositoryToken = (argoCd: IProjectArgoCd | undefined, url: string | undefined): string | undefined =>
    Object.values(argoCd?.repositories ?? {}).find(credential => credential?.source === "manual" && credential.password && url && credential.argoCdUrl === url)?.password

/** The AppProject an Application, or the applications of an ApplicationSet, belong to */
const projectOf = (resource: ArgoCdResource): unknown => {
    const spec = resource.spec as { project?: unknown; template?: { spec?: { project?: unknown } } } | undefined
    return resource.kind === "ApplicationSet" || spec?.template ? spec?.template?.spec?.project : spec?.project
}

/** What is stored of a failure: the code and the details translate on the screen, the message is for the rest */
const errorOf = (error: unknown): IArgoCdError =>
    error instanceof BusinessException ? { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } : { message: toErrorMessage(error) }

const nameClash = (name: string) =>
    createBusinessException({
        code: "ARGOCD_NAME_CLASH",
        message: `Two objects of this project would both be named ${name} in Argo CD: rename the service, frontend or environment whose slugs join into it, then initialize again`,
        statusCode: 409,
        details: { name }
    })

/** The services and frontends a deploy writes the values of: those with an image and a version */
const deployableSlugs = async (projectId: Schema.Types.ObjectId): Promise<string[]> => {
    const fields = { slug: 1, version: 1, image: 1 }
    const applications: GitOpsApplication[] = [...(await Service.find({ projectId }, fields)), ...(await Microfrontend.find({ projectId, kind: MicrofrontendKind.FRONTEND }, fields))]
    return applications.filter(isDeployable).map(application => application.slug)
}

const environmentsOf = async (projectId: Schema.Types.ObjectId) =>
    (await Environment.find({ projectId }, { slug: 1, namespace: 1 })).map(environment => ({ slug: environmentSlug(environment), namespace: environmentNamespace(environment) }))

const reinitializeRequired = () =>
    createBusinessException({
        code: "ARGOCD_REINITIALIZE_REQUIRED",
        message: "Argo CD was initialized with other repositories, or by an earlier version of the console: initialize it again to deploy the applications through it",
        statusCode: 409
    })

const nameConflict = (kind: string, name: string) =>
    createBusinessException({
        code: "ARGOCD_NAME_CONFLICT",
        message: `Argo CD already has an ${kind} named ${name} that this project did not create, or one the account of the token may not read: rename or delete it in Argo CD, then initialize again`,
        statusCode: 409,
        details: { name }
    })

const repositoryConflict = (repository: string) =>
    createBusinessException({
        code: "ARGOCD_REPOSITORY_CONFLICT",
        message: `Argo CD already has the repository ${repository} registered, and not by this project: remove it in Argo CD, then initialize again`,
        statusCode: 409,
        details: { repository }
    })

const gitOpsRequired = () =>
    createBusinessException({
        code: "ARGOCD_GITOPS_REQUIRED",
        message: "Turn GitOps on and save its configuration repository before initializing Argo CD: that is what Argo CD deploys",
        statusCode: 422
    })

const tokenRequired = () =>
    createBusinessException({
        code: "ARGOCD_TOKEN_REQUIRED",
        message: "Paste the API token of the Argo CD account: it is asked again whenever the URL changes, so the stored one never goes to another server"
    })

/**
 * Hands the GitOps repositories of a project to an Argo CD instance that runs on another cluster, through its
 * API: the credentials to read them, an AppProject confining the project to them and to the namespaces of its
 * environments, the ApplicationSet Argo CD makes the Application of each environment from, and per service and
 * frontend the ApplicationSet of its applications. Running it again re-aligns Argo CD with the project: the
 * environments added since get theirs, those deleted lose theirs, the deploy tokens of GitLab are rotated and
 * the credentials of a repository no longer linked are withdrawn. Between two initializations, every deploy
 * aligns the ApplicationSets of the services and frontends.
 *
 * The console owns the credentials: the token of Argo CD and those of the repositories are stored encrypted,
 * and none of them goes back to a client. The configuration repository, which holds the secrets in plaintext,
 * is registered for the AppProject of the project only; the applications one, which holds Helm values, is
 * registered globally, as the git generator of an ApplicationSet reads it outside of any AppProject.
 */
export class ArgoCdService extends BaseAuthorizedService {
    /** Any member of the project sees where it is deployed from; the credentials stay behind */
    async get(projectId: string | Schema.Types.ObjectId): Promise<ArgoCdStatusDTO> {
        const projectIdObj = toObjectId(projectId)
        await this.ensureAccessToProject(projectIdObj)
        const project = await Project.findById(projectIdObj, { organizationId: 1, gitOps: 1, argoCd: 1 })
        if (!project) throw new ProjectNotFoundError(String(projectId))
        const canInitialize = await new GitOpsService(this.user).ensureOwner(projectIdObj, project.organizationId).then(
            () => true,
            () => false
        )
        return this.status(projectIdObj, project.gitOps, project.argoCd, canInitialize)
    }

    /**
     * Initializes Argo CD for the project, or re-aligns it. Only an owner of the project does it, one at a time,
     * and only once GitOps has a configuration repository. The token is checked, and every name the project
     * would take is checked to be free or its own, before anything is written. A GitLab repository gets a new
     * deploy token, and the one before is revoked only once Argo CD holds the new one. A failure is stored on
     * the project, for the screen to show, and goes on as it was.
     */
    async initialize(projectId: string | Schema.Types.ObjectId, input: ArgoCdInitializeInput): Promise<ArgoCdStatusDTO> {
        const projectIdObj = toObjectId(projectId)
        await this.ensureAccessToProject(projectIdObj)
        const project = await Project.findById(projectIdObj)
        if (!project) throw new ProjectNotFoundError(String(projectId))
        const gitOpsService = new GitOpsService(this.user)
        await gitOpsService.ensureOwner(projectIdObj, project.organizationId)

        if (!project.gitOps?.enabled || !project.gitOps.codeRepository) throw gitOpsRequired()

        const url = normalizeUrl(input?.url)
        // Checked again under the lease, on the project as it is then: this only refuses early what cannot go through
        if (!retyped(input?.token) && project.argoCd?.url !== url) throw tokenRequired()

        // An environment whose slug or namespace Kubernetes refuses stops the run before anything is written
        const environments = await environmentsOf(projectIdObj)

        const lease: Lease = { at: new Date() }
        await this.acquire(projectIdObj, lease)
        try {
            // Read again under the lease: a run that ended meanwhile may have rotated the tokens read above
            const current = await Project.findById(projectIdObj, { slug: 1, gitOps: 1, argoCd: 1 })
            if (!current) throw new ProjectNotFoundError(String(projectId))
            const gitOps = current.gitOps
            if (!gitOps?.enabled || !gitOps.codeRepository) throw gitOpsRequired()
            const previous = current.argoCd
            // The stored token goes only to the URL it was stored with: pointing the console elsewhere asks for it again
            const token = retyped(input?.token) ?? (previous?.url === url ? previous.token : undefined)
            if (!token) throw tokenRequired()

            const client = new ArgoCdClient(url, token)
            const repositories: ArgoCdRepositories = { ...previous?.repositories }
            // Those of another Argo CD are left there, as the rest of what the console made on it
            let deletions = (previous?.pendingRepositoryDeletions ?? []).filter(registration => registration.argoCdUrl === url)
            let pending: PendingDeployToken | undefined
            let verified = false
            const save = (argoCd: IProjectArgoCd) => this.save(projectIdObj, { ...argoCd, pendingRepositoryDeletions: deletions }, lease)
            try {
                await client.getUserInfo()
                verified = true

                const projectName = appProjectName(String(projectIdObj), current.slug)
                const targets: RepositoryTarget[] = []
                for (const [kind, link] of linksOf(gitOps)) {
                    const connection = await gitOpsService.connectionOf(link, projectIdObj)
                    const repoUrl = cloneUrlFor({ component: { codeRepository: link }, codeRepository: connection, repositoryName: repositoryNameFor(link, connection) })
                    targets.push({ kind, link, connection, repoUrl, argoProject: kind === "configuration" ? projectName : undefined })
                }
                const repoUrlOf = (kind: ArgoCdRepositoryKind) => targets.find(target => target.kind === kind)?.repoUrl
                const applicationsTarget = targets.find(target => target.kind === "applications")
                const state = buildArgoCdState({
                    projectId: String(projectIdObj),
                    projectSlug: current.slug,
                    configurationRepoUrl: repoUrlOf("configuration"),
                    applicationsRepoUrl: repoUrlOf("applications"),
                    environments,
                    ...(applicationsTarget ? { applications: await deployableSlugs(projectIdObj), applicationBranches: await this.branchesOf(applicationsTarget) } : {})
                })
                const clash = clashingName(state)
                if (clash) throw nameClash(clash)

                // Every name is checked before the first write: one taken by something else stops the run with nothing changed.
                // An object the account may not read is taken too, by something it cannot see
                const isOurs = (resource: ArgoCdResource | null) => !resource || resource.metadata?.labels?.[PROJECT_ID_LABEL] === String(projectIdObj)
                const probe = <T>(request: Promise<T>, conflict: () => BusinessException) =>
                    request.catch(error => Promise.reject(error instanceof BusinessException && error.code === "ARGOCD_FORBIDDEN" ? conflict() : error))
                if (!isOurs(await probe(client.getProject(projectName), () => nameConflict("AppProject", projectName)))) throw nameConflict("AppProject", projectName)
                // Argo CD makes the Applications of the environments: one of the same name already there would not be its own
                for (const name of state.environmentApplications) {
                    const conflict = () => nameConflict("Application", name)
                    if (!isOurs(await probe(client.getApplication(name, projectName), conflict))) throw conflict()
                }
                for (const { metadata } of state.applicationSets) {
                    const conflict = () => nameConflict("ApplicationSet", metadata.name)
                    if (!isOurs(await probe(client.getApplicationSet(metadata.name), conflict))) throw conflict()
                }
                for (const target of targets) {
                    const before = previous?.repositories?.[target.kind]
                    const ours = before?.argoCdUrl === url && before.repoUrl === target.repoUrl && before.argoProject === target.argoProject
                    if (!ours && (await client.getRepository(target.repoUrl))) throw repositoryConflict(target.repoUrl)
                }

                await client.upsertProject(state.appProject)

                const undeleted: IArgoCdRepositoryRegistration[] = []
                for (const target of targets) {
                    const { kind, link, connection, repoUrl, argoProject } = target
                    const before = previous?.repositories?.[kind]
                    const common = { argoCdUrl: url, repoUrl, argoProject, codeRepositoryId: String(connection._id) }
                    let credential: IArgoCdRepositoryCredential
                    if (connection.provider === CodeRepositoryProvider.GITLAB) {
                        const gitlab = new GitlabClient(connection.gitlabData?.url ?? "", connection.accessToken)
                        const deployTokenFailed = (error: unknown) =>
                            createBusinessException({
                                code: "ARGOCD_DEPLOY_TOKEN_FAILED",
                                message: `GitLab did not create the deploy token of ${link.name} (${toErrorMessage(error)}): the token of the connection needs the Maintainer role on the project and the api scope`,
                                statusCode: 502,
                                details: { repository: link.name, reason: toErrorMessage(error) }
                            })
                        const gitlabProject = await gitlab.getProject(gitlabAddressOf(link, connection)).catch(error => Promise.reject(deployTokenFailed(error)))
                        const deployToken = await gitlab
                            .createDeployToken(gitlabProject.id, { name: DEPLOY_TOKEN_NAME, scopes: ["read_repository"] })
                            .catch(error => Promise.reject(deployTokenFailed(error)))
                        pending = { gitlab, gitlabProjectId: gitlabProject.id, id: deployToken.id }
                        credential = { source: "deployToken", username: deployToken.username, password: deployToken.token, deployTokenId: deployToken.id, gitlabProjectId: gitlabProject.id, ...common }
                    } else {
                        const password = retyped(input?.repositoryToken) ?? storedRepositoryToken(previous, url)
                        if (!password) {
                            throw createBusinessException({
                                code: "ARGOCD_REPOSITORY_TOKEN_REQUIRED",
                                message: `Paste a read-only token Argo CD can clone ${link.name} with: ${connection.provider} cannot create one for it`,
                                details: { repository: link.name, provider: connection.provider }
                            })
                        }
                        credential = { source: "manual", username: gitCredentialsFor(connection).username, password, ...common }
                    }

                    await client.upsertRepository({ repo: repoUrl, username: credential.username, password: credential.password, project: argoProject })
                    repositories[kind] = credential
                    // Stored at once: whatever fails next, the console knows which token Argo CD holds. Until it is
                    // stored the new deploy token stays pending, revoked should the save fail
                    await save({ ...previous, url, token, repositories })
                    pending = undefined
                    if (before) undeleted.push(...(await this.retire(client, url, projectIdObj, before, credential)))
                }
                for (const kind of ["configuration", "applications"] as const) {
                    const before = previous?.repositories?.[kind]
                    if (!before || targets.some(target => target.kind === kind)) continue
                    undeleted.push(...(await this.retire(client, url, projectIdObj, before)))
                    delete repositories[kind]
                }
                // The deletions an earlier run could not make, unless the repository is registered there again now
                const retried: IArgoCdRepositoryRegistration[] = []
                for (const registration of deletions) {
                    if (targets.some(target => target.repoUrl === registration.repoUrl && target.argoProject === registration.argoProject)) continue
                    if (!(await this.deleteRegistration(client, registration))) retried.push(registration)
                }
                deletions = [...retried, ...undeleted]
                await save({ ...previous, url, token, repositories })

                for (const applicationSet of state.applicationSets) await client.upsertApplicationSet(applicationSet)

                // What the console created for an environment that is gone, or a repository no longer linked. The
                // applications an ApplicationSet generated are left to it: they carry the label of the project too.
                // The console makes no Application itself any more: those an earlier initialization made per
                // environment go, the ApplicationSet of the environments makes them again
                const kept = new Set(state.applicationSets.map(resource => resource.metadata.name))
                const selector = `${PROJECT_ID_LABEL}=${projectIdObj}`
                for (const application of await client.listApplications(`${selector},${COMPONENT_LABEL}=configuration`, projectName)) {
                    if (projectOf(application) === projectName) await client.deleteApplication(application.metadata.name)
                }
                for (const applicationSet of await client.listApplicationSets(selector, projectName)) {
                    if (!kept.has(applicationSet.metadata.name) && projectOf({ ...applicationSet, kind: "ApplicationSet" }) === projectName)
                        await client.deleteApplicationSet(applicationSet.metadata.name)
                }

                const argoCd: IProjectArgoCd = { url, token, repositories, initializedAt: new Date() }
                await save(argoCd)
                return this.status(projectIdObj, gitOps, { ...argoCd, pendingRepositoryDeletions: deletions }, true)
            } catch (error) {
                if (pending) await this.revoke(pending)
                const lastError = errorOf(error)
                // Once the token is known to be good it is kept, and so are the credentials Argo CD already holds
                await save(verified ? { ...previous, url, token, repositories, lastError } : { ...previous, lastError }).catch(saveError =>
                    fastify.log.error({ error: toErrorMessage(saveError) }, "Argo CD initialization failure not stored")
                )
                throw error
            }
        } finally {
            await this.release(projectIdObj, lease)
        }
    }

    /**
     * Gives Argo CD the ApplicationSet of every service and frontend once a deploy has committed their values:
     * a service deployed for the first time, or an environment whose branch the deploy just created, gets its
     * Applications without initializing again. Only while the applications repository is the one Argo CD was
     * handed; the environments and the AppProject wait for the next initialization. Never fails the deploy,
     * which already went through: what goes wrong is stored on the project, for the settings to show.
     */
    async alignApplications(projectId: Schema.Types.ObjectId): Promise<void> {
        // Stored only while no initialization runs: the one that runs re-aligns everything, and saves over it
        const idle = { _id: projectId, "argoCd.initializingAt": { $exists: false } }
        try {
            const project = await Project.findById(projectId, { slug: 1, gitOps: 1, argoCd: 1 })
            const argoCd = project?.argoCd
            const link = project?.gitOps?.enabled ? project.gitOps.applicationsCodeRepository : undefined
            if (!project || !link || !argoCd?.initializedAt || !argoCd.url || !argoCd.token) return
            // An initialization running read the applications already: its cleanup would delete what this creates
            if (argoCd.initializingAt && new Date(argoCd.initializingAt).getTime() > Date.now() - LEASE_MS) return

            const registered = argoCd.repositories?.applications
            const connection = await new GitOpsService(this.user).connectionOf(link, projectId)
            const repoUrl = cloneUrlFor({ component: { codeRepository: link }, codeRepository: connection, repositoryName: repositoryNameFor(link, connection) })
            // Argo CD was handed another repository, or none: only an initialization registers this one
            if (registered?.argoCdUrl !== argoCd.url || registered.repoUrl !== repoUrl) throw reinitializeRequired()

            const client = new ArgoCdClient(argoCd.url, argoCd.token)
            const projectName = appProjectName(String(projectId), project.slug)
            // The ApplicationSets of an earlier version, per environment, generate the same workloads: an initialization replaces them
            const earlier = await client.listApplicationSets(`${PROJECT_ID_LABEL}=${projectId},${COMPONENT_LABEL}=applications`, projectName)
            if (earlier.some(applicationSet => !applicationSet.metadata.labels?.[APPLICATION_LABEL])) throw reinitializeRequired()

            const target = {
                projectId: String(projectId),
                projectSlug: project.slug,
                // Only for the names its objects take, which no application may take too
                configurationRepoUrl: argoCd.repositories?.configuration?.repoUrl,
                applicationsRepoUrl: repoUrl,
                environments: await environmentsOf(projectId),
                applications: await deployableSlugs(projectId),
                applicationBranches: await this.branchesOf({ link, connection })
            }
            const clash = clashingName(buildArgoCdState(target))
            // An environment added since the initialization has no namespace in the AppProject yet: its Applications would only fail
            const destinations = ((await client.getProject(projectName))?.spec?.destinations ?? []) as Array<{ namespace?: string }>
            target.environments = target.environments.filter(environment => destinations.some(destination => destination.namespace === environment.namespace))
            if (clash) throw nameClash(clash)

            const applicationSets = buildApplicationSets(target)
            for (const { metadata } of applicationSets) {
                const existing = await client
                    .getApplicationSet(metadata.name)
                    .catch(error => Promise.reject(error instanceof BusinessException && error.code === "ARGOCD_FORBIDDEN" ? nameConflict("ApplicationSet", metadata.name) : error))
                if (existing && (existing.metadata?.labels?.[PROJECT_ID_LABEL] !== String(projectId) || projectOf({ ...existing, kind: "ApplicationSet" }) !== projectName))
                    throw nameConflict("ApplicationSet", metadata.name)
            }
            for (const applicationSet of applicationSets) await client.upsertApplicationSet(applicationSet)
            if (argoCd.alignError) await Project.updateOne(idle, { $unset: { "argoCd.alignError": 1 } })
        } catch (error) {
            fastify.log.error({ error: toErrorMessage(error), projectId: String(projectId) }, "Argo CD ApplicationSets of the applications not aligned after a deploy")
            await Project.updateOne(idle, { $set: { "argoCd.alignError": errorOf(error) } }).catch(saveError =>
                fastify.log.error({ error: toErrorMessage(saveError) }, "Argo CD alignment failure not stored")
            )
        }
    }

    /** The branches of the applications repository: Argo CD fails an ApplicationSet listing a revision that does not exist */
    private async branchesOf({ link, connection }: Pick<RepositoryTarget, "link" | "connection">): Promise<string[]> {
        const branches = await new CodeRepositoryService(this.user).getBranches(String(connection._id), repositoryNameFor(link, connection)).catch(error =>
            Promise.reject(
                createBusinessException({
                    code: "ARGOCD_BRANCHES_FAILED",
                    message: `The branches of ${link.name} could not be read (${toErrorMessage(error)}): the connection must reach the repository`,
                    statusCode: 502,
                    details: { repository: link.name, reason: toErrorMessage(error) }
                })
            )
        )
        return branches.map(branch => branch.branch)
    }

    private async status(projectId: Schema.Types.ObjectId, gitOps: IProjectGitOps | undefined, argoCd: IProjectArgoCd | undefined, canInitialize: boolean): Promise<ArgoCdStatusDTO> {
        const links = linksOf(gitOps)
        const connections = links.length > 0 ? await CodeRepository.find({ _id: { $in: links.map(([, link]) => link.codeRepositoryId) }, projectId }, { provider: 1 }) : []
        const repositoryTokenProviders = [...new Set(connections.map(connection => connection.provider).filter(provider => provider !== CodeRepositoryProvider.GITLAB))]
        const repositories: ArgoCdStatusDTO["repositories"] = {}
        for (const [kind] of links) {
            const credential = argoCd?.repositories?.[kind]
            if (credential) repositories[kind] = { source: credential.source }
        }
        return {
            url: argoCd?.url,
            configured: Boolean(argoCd?.url && argoCd.token),
            initializedAt: argoCd?.initializedAt,
            lastError: argoCd?.lastError,
            alignError: argoCd?.alignError,
            repositories,
            needsRepositoryToken: repositoryTokenProviders.length > 0,
            repositoryTokenProviders,
            repositoryTokenStored: Boolean(storedRepositoryToken(argoCd, argoCd?.url)),
            canInitialize
        }
    }

    /**
     * Withdraws the credentials Argo CD read a repository with until now, once the next ones are in, or once
     * the repository is no longer linked. The registration goes from the Argo CD it was made on when that is
     * still the one initialized, and is not the one just made; one on an Argo CD the project moved away from is
     * left there, as the console no longer trusts that instance. A deploy token is revoked on GitLab in any
     * case, through the connection it was created with.
     */
    private async retire(
        client: ArgoCdClient,
        url: string,
        projectId: Schema.Types.ObjectId,
        before: IArgoCdRepositoryCredential,
        next?: IArgoCdRepositoryCredential
    ): Promise<IArgoCdRepositoryRegistration[]> {
        const undeleted: IArgoCdRepositoryRegistration[] = []
        const sameRegistration = next && next.argoCdUrl === before.argoCdUrl && next.repoUrl === before.repoUrl && next.argoProject === before.argoProject
        if (before.argoCdUrl === url && !sameRegistration) {
            const registration = { argoCdUrl: before.argoCdUrl, repoUrl: before.repoUrl, argoProject: before.argoProject }
            if (!(await this.deleteRegistration(client, registration))) undeleted.push(registration)
        }
        if (before.source !== "deployToken" || before.deployTokenId === undefined || before.gitlabProjectId === undefined) return undeleted
        const connection = await CodeRepository.findOne({ _id: toObjectId(before.codeRepositoryId), projectId })
        if (connection?.provider !== CodeRepositoryProvider.GITLAB || !connection.gitlabData?.url) {
            fastify.log.warn({ gitlabProjectId: before.gitlabProjectId, deployTokenId: before.deployTokenId }, "Argo CD deploy token left in place: its GitLab connection is gone")
            return undeleted
        }
        await this.revoke({ gitlab: new GitlabClient(connection.gitlabData.url, connection.accessToken), gitlabProjectId: before.gitlabProjectId, id: before.deployTokenId })
        return undeleted
    }

    /** Whether the registration is gone from Argo CD, one already gone included: when not, the next run tries again */
    private async deleteRegistration(client: ArgoCdClient, registration: IArgoCdRepositoryRegistration): Promise<boolean> {
        return client.deleteRepository(registration.repoUrl, registration.argoProject).then(
            () => true,
            error => {
                fastify.log.error({ error: toErrorMessage(error), repository: registration.repoUrl }, "Argo CD registration of a repository no longer used not deleted, retried next time")
                return false
            }
        )
    }

    /** Best effort: a token that cannot be revoked now is still read-only, and the initialization is not undone for it */
    private async revoke({ gitlab, gitlabProjectId, id }: PendingDeployToken) {
        await gitlab.revokeDeployToken(gitlabProjectId, id).catch(error => fastify.log.error({ error: toErrorMessage(error), gitlabProjectId, deployTokenId: id }, "Argo CD deploy token not revoked"))
    }

    /** One initialization of a project at a time: two would rotate the deploy tokens under each other */
    private async acquire(projectId: Schema.Types.ObjectId, lease: Lease) {
        const leased = await Project.findOneAndUpdate(
            { _id: projectId, "argoCd.initializingAt": { $not: { $gt: new Date(lease.at.getTime() - LEASE_MS) } } },
            { $set: { "argoCd.initializingAt": lease.at } },
            { projection: { _id: 1 } }
        )
        if (!leased) {
            throw createBusinessException({ code: "ARGOCD_BUSY", message: "Argo CD is being initialized for this project already: try again in a moment", statusCode: 409 })
        }
    }

    private async release(projectId: Schema.Types.ObjectId, lease: Lease) {
        await Project.updateOne({ _id: projectId, "argoCd.initializingAt": lease.at }, { $unset: { "argoCd.initializingAt": 1 } }).catch(error =>
            fastify.log.error({ error: toErrorMessage(error) }, "Argo CD initialization lease not released")
        )
    }

    /**
     * Saves only while the run still holds its lease, and renews it. A run that took longer than the lease lets
     * another one start, and must not overwrite what that one stores: it stops instead. A copy goes to the
     * update, as the plugin encrypts the credentials in place.
     */
    private async save(projectId: Schema.Types.ObjectId, argoCd: IProjectArgoCd, lease: Lease) {
        const renewed = new Date()
        const { matchedCount } = await Project.updateOne({ _id: projectId, "argoCd.initializingAt": lease.at }, { $set: { argoCd: structuredClone({ ...argoCd, initializingAt: renewed }) } })
        if (matchedCount === 0) {
            throw createBusinessException({
                code: "ARGOCD_LEASE_LOST",
                message: "Another initialization of Argo CD took over this project while this one ran: check its outcome, and initialize again if needed",
                statusCode: 409
            })
        }
        lease.at = renewed
    }
}

export default ArgoCdService
