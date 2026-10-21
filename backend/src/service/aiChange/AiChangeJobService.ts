import fs from "node:fs/promises"
import path from "node:path"
import { Types } from "mongoose"
import { fastify } from "../.."
import { createBusinessException } from "../../errors/BusinessException"
import { EntityNotFoundError } from "../../errors/EntityNotFoundError"
import AiChangeJob, { AiJobScope, AiJobStatus, IAiChangeJob } from "../../models/AiChangeJobModel"
import AiChangeRequest, { AI_CHANGE_MAX_EVENTS, AiChangeFileAction, AiChangeStatus, IAiChangeEvent, IAiChangeFile, IAiChangeRequest } from "../../models/AiChangeRequestModel"
import CodeRepository from "../../models/CodeRepositoryModel"
import Domain, { IDomain } from "../../models/DomainModel"
import Microfrontend from "../../models/MicrofrontendModel"
import Project, { IProject } from "../../models/ProjectModel"
import Service from "../../models/ServiceModel"
import { toObjectId } from "../../utils/mongooseUtils"
import { withRepositoryLock } from "../../utils/repositoryLock"
import { isProtectedPath, resolveInsideWorkingCopy } from "../../utils/workspacePaths"
import { ResolvedAiModel } from "../AiModelService"
import { redactSecrets } from "../assistant/assistantTools"
import { domainScopeForbidden, isInDomainScope } from "../BaseAuthorizedService"
import { addUsage, aiProviderError, LlmClient, LlmEffort, LlmUsage, NO_USAGE, resolveEffort } from "../llm"
import { RepositoryFileService, repositoryNameFor, toErrorMessage } from "../RepositoryFileService"
import RepositoryWorkspaceService, { OpenedWorkspace } from "../workspace/RepositoryWorkspaceService"
import {
    componentIdOf,
    componentOf,
    componentsOfJob,
    findComponents,
    fromMicrofrontend,
    fromService,
    ownerFields,
    RepositoryComponent,
    RepositoryComponentKind,
    RepositoryComponentRef
} from "../workspace/repositoryComponent"
import { AI_CHANGE_DEFAULT_EFFORT, AI_CHANGE_LIMITS, AiChangeAgentRepository, runAiChangeAgent } from "./aiChangeAgent"
import {
    AiChangeBaseService,
    authorOf,
    branchName,
    commitMessage,
    conversationPrompts,
    ensureNotBeingRefined,
    firstLine,
    followUpRunning,
    loggable,
    PROPOSAL_TTL_MS,
    STALE_AFTER_MS,
    staleOutcome,
    storable,
    toCommitFiles
} from "./aiChangeShared"

/** Repositories one job may work on: each is a clone and a share of the model's context. */
const MAX_REPOSITORIES_PER_JOB = 10
/** Jobs running or queued at once in one project: each one is minutes of paid model time. */
const MAX_ACTIVE_JOBS_PER_PROJECT = 3
const ACTIVE_JOB_STATUSES = [AiJobStatus.PENDING, AiJobStatus.RUNNING]
const LISTED_JOBS = 20
/** Pages of LISTED_JOBS a list reads at most, filling the places of the jobs out of a member's domain scope. */
const MAX_LISTED_PAGES = 10
/** How far back a follow-up looks for the requests that came before it. */
const MAX_CHAIN_LENGTH = 50
/** How long a job waits for all its working copies together: well before it would look dead. */
const LOCK_WAIT_MS = 10 * 60_000

/** File contents stay out of every view: the diff is read from the request of each repository. */
const WITHOUT_CONTENTS = { "files.originalContent": 0, "files.proposedContent": 0, events: 0 } as const
/** Neither the progress nor the conversation of the agent: what lists of jobs read. */
const JOB_LISTED = { events: 0, transcript: 0 } as const

export interface AiJobCreateInput {
    prompt: string
    scope: AiJobScope
    /** The domain whose microfrontends and services a `domain` job works on. */
    domainId?: string
    microfrontendIds?: string[]
    serviceIds?: string[]
    /** The branch each repository starts from, by microfrontend or service id: its default branch when left out. */
    baseBranches?: Record<string, string>
    /** How hard the agent reasons: `high` when left out. */
    effort?: LlmEffort
    /** The AI the agent runs on, one the project may use: the project's default when left out. */
    aiModelId?: string
}

export interface AiJobFollowUpInput {
    prompt: string
    /** The repositories of the parent job to refine; all those still proposed when both are left out. */
    microfrontendIds?: string[]
    serviceIds?: string[]
    /** How hard the agent reasons: the parent's effort when left out. */
    effort?: LlmEffort
    /** The AI the agent runs on: the parent's when left out and the project may still use it, else the project's default. */
    aiModelId?: string
}

export interface AiJobRepositoryView {
    requestId: string
    /** Whether the repository is a microfrontend's or a service's: the `microfrontend*` fields describe either. */
    kind: RepositoryComponentKind
    microfrontendId: string
    microfrontendName: string
    microfrontendSlug: string
    /** The repository on its provider, unset when the component has none any more. */
    repository?: { name: string; cloneUrlHttps?: string }
    status: AiChangeStatus
    files: { path: string; action: AiChangeFileAction }[]
    error?: string
    baseBranch: string
    /** The feature branch the proposal is pushed on. */
    branch?: string
    /** On the feature branch while proposed, on the base once applied. */
    commit?: string
    pushError?: string
    pullRequestUrl?: string
    pullRequestError?: string
}

/** A job as the console and the assistant see it: its requests summed up per repository, without file contents. */
export interface AiJobView {
    _id: string
    projectId: string
    userId: string
    parentJobId?: string
    rootJobId: string
    prompt: string
    scope: AiJobScope
    domainId?: string
    status: AiJobStatus
    effort: LlmEffort
    /** The AI the agent ran on; unset on jobs from before AIs could be chosen. */
    aiModelId?: string
    /** Left out of lists. */
    events?: { at: Date; kind: IAiChangeEvent["kind"]; message: string }[]
    summary?: string
    error?: string
    usage: LlmUsage
    repositories: AiJobRepositoryView[]
    createdAt: Date
    updatedAt: Date
}

/** The agents at work on one microfrontend (or service): the console animates its card while any is. */
export interface AiWorkingAgentsView {
    /** The id of the microfrontend or of the service. */
    microfrontendId: string
    agents: number
}

/** A repository the job is about to work on. */
interface JobRepository {
    component: RepositoryComponent
    baseBranch: string
    /** The request of the parent job on the same repository, for a follow-up. */
    parentId?: IAiChangeRequest["_id"]
    /** A follow-up goes on on its parent's feature branch, and with its pull request. */
    branch?: string
    pullRequestUrl?: string
}

/** A repository of a running job: its request and its prepared working copy. */
interface RunningRepository {
    request: IAiChangeRequest
    component: RepositoryComponent
    workspace: OpenedWorkspace
    baseCommit?: string
    /** The files of the parent request, written on the working copy before the agent starts. */
    previousFiles?: IAiChangeFile[]
    /** The pull request description of the parent request: kept when the agent only answers. */
    previousSummary?: string
    /** The commit of the parent request on the feature branch, when made on the same base: still the proposal if the agent only answers. */
    previousCommit?: string
}

const isStale = (job: Pick<IAiChangeJob, "status" | "updatedAt">) => ACTIVE_JOB_STATUSES.includes(job.status) && Date.now() - job.updatedAt.getTime() > STALE_AFTER_MS

const tooMany = () =>
    createBusinessException({
        code: "AI_JOB_TOO_MANY_REPOSITORIES",
        message: `A job works on at most ${MAX_REPOSITORIES_PER_JOB} repositories: select the microfrontends and services to change`,
        statusCode: 422
    })

const noRepositories = (message: string) => createBusinessException({ code: "AI_JOB_NO_REPOSITORIES", message, statusCode: 422 })

const notDone = () => createBusinessException({ code: "AI_JOB_NOT_DONE", message: "The job has not finished yet", statusCode: 409 })

const expiry = () => new Date(Date.now() + PROPOSAL_TTL_MS)

const event = (kind: IAiChangeEvent["kind"], message: string) => ({ $push: { events: { $each: [{ at: new Date(), kind, message }], $slice: -AI_CHANGE_MAX_EVENTS } } })

const sameComponent = (ref: RepositoryComponentRef) => (component: RepositoryComponent) => component.kind === ref.kind && String(component._id) === ref.id

/** Whether a working copy holds exactly the files a follow-up started from: the agent changed nothing of its own. */
const sameFiles = (previous: IAiChangeFile[], files: IAiChangeFile[]) =>
    files.length === previous.length &&
    files.every(file => previous.some(candidate => candidate.path === file.path && candidate.action === file.action && candidate.proposedContent === file.proposedContent))

/**
 * The slug the paths of each repository start with in a multi-repository job. A service may share
 * its slug with a microfrontend of the project: the later one gets its kind appended, so every
 * path still points into exactly one repository.
 */
const pathSlugs = (components: RepositoryComponent[]) => {
    const taken = new Set<string>()
    return components.map(component => {
        let slug = component.slug
        while (taken.has(slug)) slug = `${slug}-${component.kind}`
        taken.add(slug)
        return slug
    })
}

/** What the agent is told of a repository: a microfrontend's stack, or what the platform expects of a service's container. */
const agentRepository = (component: RepositoryComponent, slug: string, rest: Omit<AiChangeAgentRepository, "microfrontend" | "service">): AiChangeAgentRepository =>
    component.kind === "service"
        ? {
              ...rest,
              service: {
                  name: component.name,
                  slug,
                  runtime: component.runtime,
                  framework: component.framework,
                  port: component.port,
                  livenessPath: component.livenessPath,
                  readinessPath: component.readinessPath,
                  docsPath: component.docsPath,
                  openApiPath: component.openApiPath,
                  env: component.env.map(({ name, required, secret, description }) => ({ name, required, secret, description })),
                  context: component.context
              }
          }
        : { ...rest, microfrontend: { name: component.name, slug, framework: component.framework, compiler: component.compiler, context: component.context } }

const toAgentDomain = (domain: IDomain) => ({ name: domain.name, description: domain.description, context: domain.context })

/** Whether two jobs work on the same repositories in the same order: the paths the agent knows then still point where they did. */
const sameRepositories = (a: IAiChangeJob, b: IAiChangeJob) => {
    const ids = (job: IAiChangeJob) => componentsOfJob(job).map(ref => `${ref.kind}:${ref.id}`)
    return ids(a).join(",") === ids(b).join(",")
}

/** A job as lists read it: without the conversation of the agent, and without its progress unless asked. */
type ListedJob = Omit<IAiChangeJob, "events" | "transcript"> & Partial<Pick<IAiChangeJob, "events">>

const toJobView = (
    job: ListedJob,
    requests: Omit<IAiChangeRequest, "events">[],
    components: Map<string, Pick<RepositoryComponent, "name" | "slug" | "codeRepository">>,
    withEvents: boolean
): AiJobView => ({
    _id: String(job._id),
    projectId: String(job.projectId),
    userId: String(job.userId),
    parentJobId: job.parentJobId ? String(job.parentJobId) : undefined,
    rootJobId: String(job.rootJobId),
    prompt: job.prompt,
    scope: job.scope,
    domainId: job.domainId ? String(job.domainId) : undefined,
    status: job.status,
    effort: job.effort ?? AI_CHANGE_DEFAULT_EFFORT,
    aiModelId: job.aiModelId,
    events: withEvents ? (job.events ?? []).map(entry => ({ at: entry.at, kind: entry.kind, message: entry.message })) : undefined,
    summary: job.summary,
    error: job.error,
    usage: { inputTokens: job.usage?.inputTokens ?? 0, cachedInputTokens: job.usage?.cachedInputTokens ?? 0, outputTokens: job.usage?.outputTokens ?? 0 },
    repositories: componentsOfJob(job).flatMap(ref => {
        // A request nobody acted upon expires: the job then only lists the others.
        const request = requests.find(candidate => String(candidate.jobId) === String(job._id) && componentIdOf(candidate) === ref.id)
        if (!request) return []
        const component = components.get(ref.id)
        return [
            {
                requestId: String(request._id),
                kind: ref.kind,
                microfrontendId: ref.id,
                microfrontendName: component?.name ?? "",
                microfrontendSlug: component?.slug ?? "",
                repository: component?.codeRepository?.name ? { name: component.codeRepository.name, cloneUrlHttps: component.codeRepository.cloneUrlHttps } : undefined,
                status: staleOutcome(request) ?? request.status,
                files: (request.files ?? []).map(file => ({ path: file.path, action: file.action })),
                error: request.error,
                baseBranch: request.baseBranch,
                branch: request.branch,
                commit: request.commit,
                pushError: request.pushError,
                pullRequestUrl: request.pullRequestUrl,
                pullRequestError: request.pullRequestError
            }
        ]
    }),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
})

/**
 * AI agent jobs on one or more repositories of a project.
 *
 * One agent sees every repository of the job at once, so a change can span them (an API and its
 * callers); its output is still one proposal per repository, an {@link IAiChangeRequest} reviewed
 * and applied on its own. A follow-up is a child job that starts from the proposals of its parent
 * and replaces them once it proposes.
 */
export class AiChangeJobService extends AiChangeBaseService {
    /** The services of the project whose repository connection, of this same project, the workspace can open. */
    private async servicesWithRepository(projectId: string): Promise<RepositoryComponent[]> {
        const services = (await Service.find({ projectId: toObjectId(projectId) })).filter(service => service.codeRepository?.enabled && service.codeRepository.codeRepositoryId)
        if (services.length === 0) return []
        const connectionIds = [...new Set(services.map(service => String(service.codeRepository!.codeRepositoryId)))]
        const connections = await CodeRepository.find({ _id: { $in: connectionIds.map(id => toObjectId(id)) }, projectId: toObjectId(projectId) })
        return services
            .filter(service => {
                const connection = connections.find(candidate => String(candidate._id) === String(service.codeRepository!.codeRepositoryId))
                return connection && repositoryNameFor(service.codeRepository, connection)
            })
            .sort((a, b) => a.slug.localeCompare(b.slug))
            .map(fromService)
    }

    /** The microfrontends, then the services, of the project whose repository connection the workspace can open. */
    private async repositoriesOf(projectId: string): Promise<RepositoryComponent[]> {
        const targets = await new RepositoryFileService(this.user).resolveTargets(projectId)
        const microfrontends = targets
            .filter(target => target.codeRepository && target.repositoryName && target.codeRepository.projectId?.toString() === projectId)
            .map(target => fromMicrofrontend(target.microfrontend))
        return [...microfrontends, ...(await this.servicesWithRepository(projectId))]
    }

    /** A domain of the project. */
    private async domainOf(projectId: string, domainId?: string): Promise<IDomain> {
        const domain = domainId ? await Domain.findOne({ _id: toObjectId(domainId), projectId: toObjectId(projectId) }) : null
        if (!domain) throw new EntityNotFoundError(domainId ?? "domain")
        return domain
    }

    private async selectRepositories(projectId: string, input: AiJobCreateInput, domain?: IDomain): Promise<RepositoryComponent[]> {
        const available = await this.repositoriesOf(projectId)
        if (domain) {
            const members = available.filter(component => component.domainId && String(component.domainId) === String(domain._id))
            if (members.length === 0) throw noRepositories(`No microfrontend or service of the domain ${domain.name} has a code repository connected`)
            if (members.length > MAX_REPOSITORIES_PER_JOB) throw tooMany()
            return members
        }
        if (input.scope === "global") {
            if (available.length === 0) throw noRepositories("No microfrontend or service of the project has a code repository connected")
            if (available.length > MAX_REPOSITORIES_PER_JOB) throw tooMany()
            return available
        }

        const refs: RepositoryComponentRef[] = [
            ...[...new Set(input.microfrontendIds ?? [])].map(id => ({ kind: "microfrontend" as const, id })),
            ...[...new Set(input.serviceIds ?? [])].map(id => ({ kind: "service" as const, id }))
        ]
        if (refs.length === 0) throw noRepositories("Select at least one microfrontend or service")
        if (refs.length > MAX_REPOSITORIES_PER_JOB) throw tooMany()
        const inProject = (await findComponents(refs, { name: 1, projectId: 1, domainId: 1 })).filter(component => String(component.projectId) === projectId)
        const missing = refs.find(ref => !inProject.some(sameComponent(ref)))
        if (missing) throw new EntityNotFoundError(missing.id)
        for (const component of inProject) await this.ensureInDomainScope(projectId, component.domainId)
        const withoutRepository = inProject.filter(component => !available.some(sameComponent({ kind: component.kind, id: String(component._id) })))
        if (withoutRepository.length) {
            throw noRepositories(`No code repository is connected to ${withoutRepository.map(component => component.name).join(", ")}`)
        }
        return refs.map(ref => available.find(sameComponent(ref))!)
    }

    /**
     * Starts a job on every microfrontend and service of the project with a repository, on those of
     * one domain (its frontend and its backend at once), or on the selected ones.
     */
    async create(projectId: string, input: AiJobCreateInput): Promise<AiJobView> {
        await this.ensureCanChangeProject(toObjectId(projectId))
        const aiModel = await this.aiModels().resolveForProject(projectId, input.aiModelId)
        // A domain-scoped member works on their domains only: never on every repository of the project
        if (input.scope === "global") await this.ensureWholeProject(projectId)
        const domain = input.scope === "domain" ? await this.domainOf(projectId, input.domainId) : undefined
        if (domain) await this.ensureInDomainScope(projectId, domain._id)
        const components = await this.selectRepositories(projectId, input, domain)
        for (const component of components) await this.ensureRepositoryInDomainScope(component, component.codeRepository)

        const workspaceService = new RepositoryWorkspaceService(this.user)
        // Opened even when a branch is picked: it is what refuses a repository connection of another project.
        const repositories = await Promise.all(
            components.map(async component => {
                const { defaultBranch } = await workspaceService.open(component)
                return { component, baseBranch: input.baseBranches?.[String(component._id)]?.trim() || defaultBranch }
            })
        )
        const { job } = await this.start({ projectId: toObjectId(projectId), prompt: input.prompt, scope: input.scope, domainId: domain?._id, repositories, effort: input.effort }, aiModel)
        return this.view(job, true)
    }

    /**
     * A child job refining the proposals of a finished one, on all its repositories still proposed
     * or on some of them. Each new request starts from the files of the request it refines.
     */
    async followUp(jobId: string, input: AiJobFollowUpInput): Promise<AiJobView> {
        const parent = await this.getJob(jobId)
        await this.ensureCanChangeProject(parent.projectId)
        // The transcript keeps no provider's own data, so a follow-up may run on another AI than its parent.
        const aiModel = await this.aiModels().resolveForProject(parent.projectId, input.aiModelId, parent.aiModelId)
        if (parent.status !== AiJobStatus.DONE) throw notDone()
        // Two follow-ups of the same job would both start from its proposals, and the second to finish would win.
        const runningChild = await AiChangeJob.exists({ parentJobId: parent._id, status: { $in: ACTIVE_JOB_STATUSES }, updatedAt: { $gt: new Date(Date.now() - STALE_AFTER_MS) } })
        if (runningChild) throw followUpRunning("A follow-up of this job is still running: wait for it to finish")

        const parentRequests = await AiChangeRequest.find({ jobId: parent._id }, WITHOUT_CONTENTS)
        const requestOf = (componentId: string) => parentRequests.find(request => componentIdOf(request) === componentId)
        const parentRefs = componentsOfJob(parent)
        const requested = [...new Set([...(input.microfrontendIds ?? []), ...(input.serviceIds ?? [])])]
        const ids = requested.length ? requested : parentRefs.map(ref => ref.id).filter(id => requestOf(id)?.status === AiChangeStatus.PROPOSED)
        if (ids.length === 0) {
            throw createBusinessException({ code: "AI_CHANGE_NOT_PROPOSED", message: "No proposal of this job is left to refine", statusCode: 409 })
        }

        const components = await findComponents(parentRefs.filter(ref => ids.includes(ref.id)))
        const repositories: JobRepository[] = ids.map(id => {
            const component = components.find(candidate => String(candidate._id) === id)
            if (!component) throw noRepositories(`${id} is not a repository of this job`)
            // An applied or discarded proposal is not on the working copy anymore: there is nothing to refine.
            const request = requestOf(id)
            if (request?.status !== AiChangeStatus.PROPOSED) {
                throw createBusinessException({ code: "AI_CHANGE_NOT_PROPOSED", message: `The proposal for ${component.name} is not waiting for approval anymore`, statusCode: 409 })
            }
            return { component, baseBranch: request.baseBranch, parentId: request._id, branch: request.branch, pullRequestUrl: request.pullRequestUrl }
        })
        // A follow-up pushes to the repositories it refines as a new job would, whoever started the parent
        for (const { component } of repositories) await this.ensureRepositoryInDomainScope(component, component.codeRepository)

        const scope = repositories.length === parentRefs.length ? parent.scope : "selection"
        const { job } = await this.start({ projectId: parent.projectId, prompt: input.prompt, scope, domainId: parent.domainId, repositories, parentJob: parent, effort: input.effort }, aiModel)
        return this.view(job, true)
    }

    /**
     * Creates the job and one PENDING request per repository, then runs the agent in the background.
     * Callers have checked that the user may change the project.
     */
    async start(
        input: {
            projectId: IAiChangeJob["projectId"]
            prompt: string
            scope: AiJobScope
            domainId?: IAiChangeJob["domainId"] | IDomain["_id"]
            repositories: JobRepository[]
            parentJob?: IAiChangeJob
            /** Left out: the parent's for a follow-up, else `high`. */
            effort?: LlmEffort
        },
        { settings, client }: ResolvedAiModel
    ): Promise<{ job: IAiChangeJob; requests: IAiChangeRequest[] }> {
        const active = await AiChangeJob.countDocuments({ projectId: input.projectId, status: { $in: ACTIVE_JOB_STATUSES }, updatedAt: { $gt: new Date(Date.now() - STALE_AFTER_MS) } })
        if (active >= MAX_ACTIVE_JOBS_PER_PROJECT) {
            throw createBusinessException({ code: "AI_CHANGE_TOO_MANY", message: `At most ${MAX_ACTIVE_JOBS_PER_PROJECT} AI jobs can run at once in a project`, statusCode: 429 })
        }

        const userId = this.getUser()!._id
        // Named before it is created: the first job of a chain is its own root.
        const jobId = new Types.ObjectId() as unknown as IAiChangeJob["_id"]
        const queued = () => [{ at: new Date(), kind: "info" as const, message: "queued" }]
        // A follow-up goes on as hard as its parent went, unless the user chose otherwise; never above the AI's cap.
        const effort = resolveEffort(settings, input.effort ?? input.parentJob?.effort, AI_CHANGE_DEFAULT_EFFORT)
        const job = await AiChangeJob.create({
            _id: jobId,
            projectId: input.projectId,
            userId,
            parentJobId: input.parentJob?._id,
            rootJobId: input.parentJob?.rootJobId ?? jobId,
            prompt: input.prompt,
            scope: input.scope,
            domainId: input.domainId,
            effort,
            aiModelId: settings.id,
            microfrontendIds: input.repositories.filter(({ component }) => component.kind === "microfrontend").map(({ component }) => component._id),
            serviceIds: input.repositories.filter(({ component }) => component.kind === "service").map(({ component }) => component._id),
            status: AiJobStatus.PENDING,
            events: queued()
        })
        const requests = await Promise.all(
            input.repositories.map(repository =>
                AiChangeRequest.create({
                    projectId: input.projectId,
                    ...ownerFields(repository.component),
                    userId,
                    jobId,
                    jobRepositoryCount: input.repositories.length,
                    effort,
                    aiModelId: settings.id,
                    parentId: repository.parentId,
                    conversationId: input.parentJob?.rootJobId ?? jobId,
                    prompt: input.prompt,
                    baseBranch: repository.baseBranch,
                    branch: repository.branch ?? branchName(repository.component.slug),
                    pullRequestUrl: repository.pullRequestUrl,
                    status: AiChangeStatus.PENDING,
                    events: queued()
                })
            )
        )

        // Detached on purpose: the agent takes minutes, the console follows it by polling.
        this.process(String(jobId), client).catch(error => fastify.log.error({ error: loggable(error), aiJobId: String(jobId) }, "AI job crashed"))
        return { job, requests }
    }

    /**
     * One progress line, on the job and on each of its requests: the page of every repository stays live.
     * What the model said or thought can repeat a secret it read: masked, as in the assistant's saved answers.
     */
    private async log(jobId: string, kind: IAiChangeEvent["kind"], message: string) {
        const shown = kind === "text" || kind === "thinking" ? redactSecrets(message) : message
        await AiChangeJob.updateOne({ _id: toObjectId(jobId) }, event(kind, shown))
        await AiChangeRequest.updateMany({ jobId: toObjectId(jobId) }, event(kind, shown))
    }

    /** The usage is the job's: every request of it carries the same total. */
    private async addUsage(jobId: string, usage: LlmUsage) {
        const increment = { $inc: { "usage.inputTokens": usage.inputTokens, "usage.cachedInputTokens": usage.cachedInputTokens, "usage.outputTokens": usage.outputTokens } }
        await AiChangeJob.updateOne({ _id: toObjectId(jobId) }, increment)
        await AiChangeRequest.updateMany({ jobId: toObjectId(jobId) }, increment)
    }

    private async fail(jobId: string, error: string) {
        await AiChangeRequest.updateMany({ jobId: toObjectId(jobId), status: { $in: [AiChangeStatus.PENDING, AiChangeStatus.RUNNING] } }, { status: AiChangeStatus.FAILED, error, expiresAt: expiry() })
        await AiChangeJob.updateOne({ _id: toObjectId(jobId), status: { $in: ACTIVE_JOB_STATUSES } }, { status: AiJobStatus.FAILED, error, expiresAt: expiry() })
    }

    /**
     * The conversation a follow-up carries on from: its parent's, when the parent worked on the same
     * repositories and kept one. Otherwise the agent starts over, told only what was asked before.
     */
    private async historyOf(job: IAiChangeJob): Promise<IAiChangeJob["transcript"]> {
        if (!job.parentJobId) return undefined
        const parent = await AiChangeJob.findById(job.parentJobId, { transcript: 1, microfrontendIds: 1, serviceIds: 1 })
        return parent?.transcript?.length && sameRepositories(parent, job) ? parent.transcript : undefined
    }

    /** What was asked before this job in its chain, oldest first. */
    private async previousRequests(job: IAiChangeJob): Promise<{ prompt: string; summary?: string }[]> {
        const previous: { prompt: string; summary?: string }[] = []
        let parentId = job.parentJobId
        while (parentId && previous.length < MAX_CHAIN_LENGTH) {
            const parent = await AiChangeJob.findById(parentId, { prompt: 1, summary: 1, parentJobId: 1 })
            if (!parent) break
            previous.unshift({ prompt: parent.prompt, summary: parent.summary })
            parentId = parent.parentJobId
        }
        return previous
    }

    /**
     * The job: lock every working copy, reset them, write the proposals a follow-up starts from, let
     * the agent work, store what changed in each repository, reset again.
     */
    private async process(jobId: string, client: LlmClient): Promise<void> {
        const job = await AiChangeJob.findById(jobId)
        if (!job) return
        let usage: LlmUsage = NO_USAGE
        try {
            const project = await Project.findById(job.projectId)
            if (!project) throw new Error("The project no longer exists")
            // A domain deleted since leaves its members as they are: the job goes on without its description and context.
            const domain = job.domainId ? await Domain.findById(job.domainId) : null
            const requests = await AiChangeRequest.find({ jobId: job._id })
            const refs = componentsOfJob(job)
            const components = await findComponents(refs)
            // A job on single microfrontends or services still follows the context of the domains they are in.
            const memberDomainIds = domain ? [] : [...new Set(components.flatMap(component => (component.domainId ? [String(component.domainId)] : [])))]
            const memberDomains = memberDomainIds.length ? await Domain.find({ _id: { $in: memberDomainIds.map(id => toObjectId(id)) }, projectId: job.projectId }).sort({ name: 1 }) : []
            const workspaceService = new RepositoryWorkspaceService(this.user)
            const repositories: RunningRepository[] = []
            for (const ref of refs) {
                const component = components.find(sameComponent(ref))
                const request = requests.find(candidate => componentIdOf(candidate) === ref.id)
                if (!component || !request) throw new Error(`A ${ref.kind} of the job no longer exists`)
                repositories.push({ request, component, workspace: await workspaceService.open(component) })
            }

            // Locked by folder, in folder order: two jobs sharing repositories take them in the same
            // order and never wait for each other in a circle.
            const byFolder = [...repositories].sort((a, b) => (a.workspace.workingCopy.dir < b.workspace.workingCopy.dir ? -1 : a.workspace.workingCopy.dir > b.workspace.workingCopy.dir ? 1 : 0))
            let waiting = false
            const deadline = Date.now() + LOCK_WAIT_MS
            const onWait = async () => {
                if (waiting) return
                waiting = true
                await this.log(jobId, "info", "waiting-for-repository")
            }
            const locked = (index: number): Promise<void> =>
                index < byFolder.length
                    ? withRepositoryLock(byFolder[index].workspace.workingCopy.dir, () => locked(index + 1), { onWait, waitMs: Math.max(0, deadline - Date.now()) })
                    : this.work(job, project, domain, memberDomains, repositories, workspaceService, client, delta => {
                          usage = addUsage(usage, delta)
                      })
            await locked(0)
        } catch (error) {
            fastify.log.warn({ error: loggable(error), aiJobId: jobId }, "AI job failed")
            await this.fail(jobId, toErrorMessage(error))
        } finally {
            fastify.log.info({ audit: "ai_job_usage", userId: String(job.userId), projectId: String(job.projectId), jobId, effort: job.effort, aiModelId: job.aiModelId, ...usage }, "AI job usage")
        }
    }

    /** Runs with every working copy locked. The copies are reset however it ends. */
    private async work(
        job: IAiChangeJob,
        project: IProject,
        domain: IDomain | null,
        memberDomains: IDomain[],
        repositories: RunningRepository[],
        workspaceService: RepositoryWorkspaceService,
        client: LlmClient,
        onUsage: (usage: LlmUsage) => void
    ): Promise<void> {
        const jobId = String(job._id)
        try {
            // Guarded: a job declared dead while it waited for the locks stays dead.
            if (!(await AiChangeJob.findOneAndUpdate({ _id: job._id, status: AiJobStatus.PENDING }, { status: AiJobStatus.RUNNING }))) return
            await AiChangeRequest.updateMany({ jobId: job._id, status: AiChangeStatus.PENDING }, { status: AiChangeStatus.RUNNING })
            await this.log(jobId, "info", "preparing")
            for (const repository of repositories) {
                repository.baseCommit = await workspaceService.prepare(repository.workspace, repository.request.baseBranch)
                await AiChangeRequest.updateOne({ _id: repository.request._id }, { baseCommit: repository.baseCommit })
            }
            if (repositories.some(repository => repository.request.parentId)) {
                await this.log(jobId, "info", "applying-previous")
                await this.restorePrevious(repositories)
            }
            await this.log(jobId, "info", "working")

            // A job declared dead (or failed) while the agent works stops at the next round instead of spending on.
            const abort = new AbortController()
            const history = await this.historyOf(job)
            const slugs = pathSlugs(repositories.map(repository => repository.component))
            // The agent may stop midway, the provider failing or its answer cut off: what it wrote until then is still proposed.
            let stopped: string | undefined
            const result = await runAiChangeAgent(
                client,
                {
                    prompt: job.prompt,
                    effort: job.effort,
                    project: { name: project.name, context: project.context },
                    domain: domain ? toAgentDomain(domain) : undefined,
                    memberDomains: memberDomains.map(toAgentDomain),
                    repositories: repositories.map(({ component, request, workspace, previousFiles }, index) =>
                        agentRepository(component, slugs[index], {
                            baseBranch: request.baseBranch,
                            workingCopy: workspace.workingCopy,
                            previousChanges: (previousFiles ?? []).map(file => ({ path: file.path, bytes: file.proposedContent === undefined ? 0 : Buffer.byteLength(file.proposedContent, "utf8") }))
                        })
                    ),
                    previousRequests: history ? undefined : await this.previousRequests(job),
                    history
                },
                {
                    onEvent: (kind, message) => this.log(jobId, kind, message),
                    onUsage: async usage => {
                        onUsage(usage)
                        await this.addUsage(jobId, usage)
                        const current = await AiChangeJob.findById(job._id, { status: 1 })
                        if (current?.status !== AiJobStatus.RUNNING) abort.abort()
                    }
                },
                abort.signal
            ).catch(error => {
                // Aborted, the job was declared dead: nothing of it is saved.
                if (abort.signal.aborted) throw error
                // The provider's own message stays in the log: it may quote what the endpoint answered.
                stopped = aiProviderError(error).message
                fastify.log.warn({ error: loggable(error), aiJobId: jobId }, "AI job agent stopped before finishing")
                return undefined
            })

            if (result?.stopReason === "refusal") throw new Error("The model declined this request")
            if (result?.stopReason === "max_tokens") stopped = "The agent's answer was cut off: try a smaller request or a lower effort"

            const proposals: { repository: RunningRepository; files: IAiChangeFile[] }[] = []
            for (const repository of repositories) {
                const workingCopy = repository.workspace.workingCopy
                const files: IAiChangeFile[] = []
                for (const change of await workingCopy.changes()) {
                    // The toolbox refuses these already; checked again on what actually changed on disk.
                    if (isProtectedPath(change.path)) throw new Error(`The agent changed a protected file: ${repository.component.slug}/${change.path}`)
                    files.push({
                        path: change.path,
                        action: change.action,
                        baseBlobOid: change.baseBlobOid,
                        originalContent: change.action === "create" ? undefined : storable(await workingCopy.readHeadFile(change.path)),
                        proposedContent: change.action === "delete" ? undefined : await workingCopy.readWorkingFile(change.path)
                    })
                }
                // Also checked on disk: the proposal of a follow-up adds up to its parent's.
                if (files.length > AI_CHANGE_LIMITS.maxChangedFiles) {
                    throw new Error(`The proposal for ${repository.component.name} changes ${files.length} files, more than the ${AI_CHANGE_LIMITS.maxChangedFiles} allowed in one repository`)
                }
                proposals.push({ repository, files })
            }

            const anyChange = proposals.some(proposal => proposal.files.length > 0)
            // Nothing written but the parent's files: a proposal would only discard the parent.
            if (stopped && proposals.every(({ repository, files }) => sameFiles(repository.previousFiles ?? [], files))) throw new Error(stopped)
            const incomplete = stopped
                ? `The agent stopped before finishing, so this proposal is incomplete: review it, or ask a follow-up to finish it. Reason: ${stopped}`
                : result?.stopReason === "max_rounds"
                  ? "The agent ran out of steps: the proposal may be incomplete"
                  : undefined
            const summary = result?.summary || undefined
            // An answer without a change of its own is no pull request description: the proposal keeps its parent's.
            const answered = (repository: RunningRepository, files: IAiChangeFile[]) =>
                result?.stopReason === "end_turn" && repository.previousFiles !== undefined && sameFiles(repository.previousFiles, files)
            const summaryOf = (repository: RunningRepository, files: IAiChangeFile[]) => (answered(repository, files) ? repository.previousSummary : summary)
            // Pushed before they are saved: a proposal shows up with its branch already there.
            // Not for a job declared dead meanwhile: none of its proposals will be saved, the branch must keep the one that is.
            const alive = (await AiChangeJob.findById(job._id, { status: 1 }))?.status === AiJobStatus.RUNNING
            if (anyChange && alive) await this.log(jobId, "info", "pushing")
            const pushed = new Map<RunningRepository, Awaited<ReturnType<AiChangeJobService["pushProposal"]>>>()
            if (alive) for (const { repository, files } of proposals) pushed.set(repository, await this.pushProposal(repository, files, summaryOf(repository, files)))
            // Requests first: the console stops polling once the job is done. Guarded: a job get()
            // already declared dead must not come back to life.
            let saved = 0
            let partial: string | undefined
            try {
                for (const { repository, files } of proposals) {
                    const proposed = await AiChangeRequest.findOneAndUpdate(
                        { _id: repository.request._id, status: AiChangeStatus.RUNNING },
                        {
                            status: AiChangeStatus.PROPOSED,
                            files,
                            summary: summaryOf(repository, files),
                            ...pushed.get(repository),
                            error: incomplete,
                            expiresAt: expiry(),
                            ...event("info", files.length ? "proposed" : "no-changes")
                        }
                    )
                    if (!proposed) continue
                    saved++
                    if (repository.request.parentId) await this.supersede(repository.request.parentId)
                }
            } catch (error) {
                // Proposals already saved can be reviewed: the job is done, the ones left behind failed.
                if (saved === 0) throw error
                partial = `Only ${saved} of ${proposals.length} proposals could be saved: ${toErrorMessage(error)}`
                fastify.log.warn({ error: loggable(error), aiJobId: jobId }, "AI job saved part of its proposals")
                await AiChangeRequest.updateMany(
                    { jobId: job._id, status: { $in: [AiChangeStatus.PENDING, AiChangeStatus.RUNNING] } },
                    { status: AiChangeStatus.FAILED, error: partial, expiresAt: expiry() }
                )
            }
            await AiChangeJob.updateOne(
                { _id: job._id, status: AiJobStatus.RUNNING },
                {
                    status: AiJobStatus.DONE,
                    summary,
                    transcript: result?.transcript,
                    error: partial ?? incomplete,
                    expiresAt: expiry(),
                    ...event("info", anyChange ? "proposed" : "no-changes")
                }
            )
        } finally {
            for (const repository of repositories) await repository.workspace.workingCopy.discardChanges().catch(() => undefined)
        }
    }

    /**
     * Pushes a proposal on its feature branch, forced, from the base the agent started on: it can be
     * looked at in the repository, and a pull request opened from it follows every follow-up. A push
     * that fails leaves the proposal as it is: applying it, or opening its pull request, pushes it again.
     */
    private async pushProposal(repository: RunningRepository, files: IAiChangeFile[], summary: string | undefined): Promise<{ branch?: string; commit?: string; pushError?: string }> {
        if (files.length === 0) return {}
        const branch = repository.request.branch ?? branchName(repository.component.slug)
        // The agent only answered: the branch already holds this very proposal, pushing it again would only run the CI again.
        if (repository.previousCommit && sameFiles(repository.previousFiles ?? [], files)) return { branch, commit: repository.previousCommit }
        try {
            const prompts = await conversationPrompts(repository.request)
            const commit = await repository.workspace.workingCopy.commitAndPush({
                branch,
                message: commitMessage(firstLine(prompts[0], 72), summary),
                author: authorOf(this.getUser()!),
                files: toCommitFiles(files)
            })
            return { branch, commit }
        } catch (error) {
            fastify.log.warn({ error: loggable(error), aiChangeId: String(repository.request._id) }, "Could not push the proposal on its branch")
            return { branch, pushError: toErrorMessage(error) }
        }
    }

    /**
     * Writes the files each parent request proposed onto the working copy of a follow-up. Every file
     * must still be what the parent saw on the base branch: otherwise the job fails rather than
     * silently overwriting what was pushed since.
     */
    private async restorePrevious(repositories: RunningRepository[]) {
        const parents = new Map<RunningRepository, IAiChangeRequest>()
        const conflicts: string[] = []
        for (const repository of repositories) {
            if (!repository.request.parentId) continue
            const parent = await AiChangeRequest.findById(repository.request.parentId)
            if (!parent) throw new Error(`The previous proposal for ${repository.component.name} no longer exists`)
            parents.set(repository, parent)
            repository.previousFiles = parent.files
            repository.previousSummary = parent.summary
            repository.previousCommit = parent.baseCommit === repository.baseCommit ? parent.commit : undefined
            for (const file of parent.files) {
                if ((await repository.workspace.workingCopy.blobOid(repository.baseCommit!, file.path)) !== file.baseBlobOid) conflicts.push(`${repository.component.slug}/${file.path}`)
            }
        }
        if (conflicts.length) {
            throw new Error(`These files changed on the base branch after the previous proposal: ${conflicts.join(", ")}. Start a new request instead of a follow-up.`)
        }

        for (const [repository, parent] of parents) {
            const dir = repository.workspace.workingCopy.dir
            for (const file of parent.files) {
                const { absolute, relative } = await resolveInsideWorkingCopy(dir, file.path)
                if (isProtectedPath(relative)) throw new Error(`The previous proposal changes a protected file: ${repository.component.slug}/${relative}`)
                if (file.action === "delete") {
                    await fs.rm(absolute, { force: true })
                    continue
                }
                if (file.proposedContent === undefined) throw new Error(`The previous proposal lost the content of ${repository.component.slug}/${relative}`)
                await fs.mkdir(path.dirname(absolute), { recursive: true })
                await fs.writeFile(absolute, file.proposedContent, "utf8")
            }
        }
    }

    /** A proposal refined by a newer one is discarded: only the latest of a chain can be applied. */
    private async supersede(parentId: IAiChangeRequest["_id"]) {
        await AiChangeRequest.updateOne({ _id: parentId, status: AiChangeStatus.PROPOSED }, { status: AiChangeStatus.DISCARDED, ...event("info", "superseded") })
    }

    private async getJob(id: string): Promise<IAiChangeJob> {
        const job = await AiChangeJob.findById(id)
        if (!job) throw new EntityNotFoundError(id)
        await this.ensureAccessToProject(job.projectId)
        if ((await this.inDomainScope(job.projectId, [job])).length === 0) throw domainScopeForbidden()
        return this.failIfStale(job)
    }

    /**
     * The jobs a domain-scoped member may see: those working only on microfrontends and services they
     * see, and never one on the whole project. Anyone else sees them all, without a query.
     */
    private async inDomainScope<T extends ListedJob>(projectId: IAiChangeJob["projectId"], jobs: T[]): Promise<T[]> {
        const scope = await this.getDomainScope(projectId)
        if (!scope || jobs.length === 0) return jobs
        const refs = jobs.flatMap(job => componentsOfJob(job)).filter((ref, index, all) => all.findIndex(other => other.id === ref.id) === index)
        const components = await findComponents(refs, { domainId: 1 })
        const visible = new Set(components.filter(component => isInDomainScope(scope, component.domainId)).map(component => String(component._id)))
        return jobs.filter(job => job.scope !== "global" && (!job.domainId || isInDomainScope(scope, job.domainId)) && componentsOfJob(job).every(ref => visible.has(ref.id)))
    }

    /** A job whose process died is reported as failed, and so are its requests still waiting for it. */
    private async failIfStale<T extends ListedJob>(job: T): Promise<T | IAiChangeJob> {
        if (!isStale(job)) return job
        const error = "The job stopped without finishing"
        const failed = await AiChangeJob.findOneAndUpdate({ _id: job._id, status: job.status }, { status: AiJobStatus.FAILED, error, expiresAt: expiry() }, { new: true })
        await AiChangeRequest.updateMany({ jobId: job._id, status: { $in: [AiChangeStatus.PENDING, AiChangeStatus.RUNNING] } }, { status: AiChangeStatus.FAILED, error, expiresAt: expiry() })
        return failed ?? job
    }

    private async views(jobs: ListedJob[], withEvents: boolean): Promise<AiJobView[]> {
        if (jobs.length === 0) return []
        const requests = await AiChangeRequest.find({ jobId: { $in: jobs.map(job => job._id) } }, WITHOUT_CONTENTS)
        const refs = jobs.flatMap(job => componentsOfJob(job)).filter((ref, index, all) => all.findIndex(other => other.id === ref.id) === index)
        const components = await findComponents(refs, { name: 1, slug: 1, "codeRepository.name": 1, "codeRepository.cloneUrlHttps": 1 })
        const byId = new Map(components.map(component => [String(component._id), component]))
        return jobs.map(job => toJobView(job, requests, byId, withEvents))
    }

    private async view(job: IAiChangeJob, withEvents: boolean): Promise<AiJobView> {
        return (await this.views([job], withEvents))[0]
    }

    /** One job with its progress and a line per repository. */
    async get(id: string): Promise<AiJobView> {
        return this.view(await this.getJob(id), true)
    }

    /** Every job of the conversation the given one belongs to, from the first to the latest. */
    async chain(id: string): Promise<AiJobView[]> {
        const job = await this.getJob(id)
        const jobs = await this.inDomainScope(job.projectId, await AiChangeJob.find({ rootJobId: job.rootJobId, projectId: job.projectId }, { transcript: 0 }).sort({ createdAt: 1 }))
        return this.views(await Promise.all(jobs.map(candidate => this.failIfStale(candidate))), true)
    }

    /**
     * The latest conversations on a domain, everyone's, as a microfrontend page shows everyone's requests:
     * the first job of each chain, which names it, and its latest, which says where it stands. Newest first.
     */
    async domainConversations(projectId: string, domainId: string): Promise<AiJobView[]> {
        await this.ensureAccessToProject(toObjectId(projectId))
        await this.ensureInDomainScope(projectId, domainId)
        // By their roots: a chain with many follow-ups must not push the other conversations out.
        const roots = await AiChangeJob.find({ projectId: toObjectId(projectId), domainId: toObjectId(domainId), $expr: { $eq: ["$_id", "$rootJobId"] } }, JOB_LISTED)
            .sort({ createdAt: -1 })
            .limit(LISTED_JOBS)
        const latest = await Promise.all(roots.map(root => AiChangeJob.findOne({ rootJobId: root._id }, JOB_LISTED).sort({ createdAt: -1 })))
        const jobs: ListedJob[] = [...roots, ...latest.flatMap(job => (job ? [job] : []))]
            .filter((job, index, all) => all.findIndex(other => String(other._id) === String(job._id)) === index)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        return this.views(await Promise.all(jobs.map(job => this.failIfStale(job))), false)
    }

    /**
     * The latest jobs of the user in a project. `active` keeps those still running and those with a
     * proposal waiting: the console reopens their tabs after a reload.
     */
    async list(projectId: string, active = false): Promise<AiJobView[]> {
        await this.ensureAccessToProject(toObjectId(projectId))
        const filter: Record<string, unknown> = { projectId: toObjectId(projectId), userId: this.getUser()!._id }
        if (active) {
            const proposed = await AiChangeRequest.distinct("jobId", { ...filter, status: AiChangeStatus.PROPOSED, jobId: { $exists: true } })
            filter.$or = [{ status: { $in: ACTIVE_JOB_STATUSES } }, { _id: { $in: proposed } }]
        }
        // Read on page after page until the list is full: a domain-scoped member's jobs out of their scope are
        // dropped after reading, and must not take the places of those they may see. Each page starts after the
        // last job of the one before, by createdAt and then _id for the ties: a job created meanwhile shifts no
        // page, so none is read twice nor skipped. At most MAX_LISTED_PAGES pages: a member whose history is
        // mostly out of their scope gets a shorter list, not a scan of all of it.
        const listed: ListedJob[] = []
        let after: Record<string, unknown> | undefined
        for (let pages = 0; listed.length < LISTED_JOBS && pages < MAX_LISTED_PAGES; pages++) {
            const page = await AiChangeJob.find(after ? { $and: [filter, after] } : filter, JOB_LISTED)
                .sort({ createdAt: -1, _id: -1 })
                .limit(LISTED_JOBS)
            listed.push(...(await this.inDomainScope(toObjectId(projectId), page)))
            if (page.length < LISTED_JOBS) break
            const last = page[page.length - 1]
            after = { $or: [{ createdAt: { $lt: last.createdAt } }, { createdAt: last.createdAt, _id: { $lt: last._id } }] }
        }
        listed.splice(LISTED_JOBS)
        const jobs = await Promise.all(listed.map(job => this.failIfStale(job)))
        const views = await this.views(jobs, false)
        return active ? views.filter(view => ACTIVE_JOB_STATUSES.includes(view.status) || view.repositories.some(repository => repository.status === AiChangeStatus.PROPOSED)) : views
    }

    /**
     * How many agents are working on each microfrontend and service of the project right now, whoever started
     * them: a job counts on every repository it works on, a change asked from the component page on its own.
     * A job is fresh by its own date, its requests are not touched while it runs.
     */
    async working(projectId: string): Promise<AiWorkingAgentsView[]> {
        await this.ensureAccessToProject(toObjectId(projectId))
        const fresh = { $gt: new Date(Date.now() - STALE_AFTER_MS) }
        const [jobs, requests] = await Promise.all([
            AiChangeJob.find({ projectId: toObjectId(projectId), status: { $in: ACTIVE_JOB_STATUSES }, updatedAt: fresh }, { microfrontendIds: 1, serviceIds: 1 }),
            AiChangeRequest.find(
                { projectId: toObjectId(projectId), jobId: { $exists: false }, status: { $in: [AiChangeStatus.PENDING, AiChangeStatus.RUNNING] }, updatedAt: fresh },
                { microfrontendId: 1, serviceId: 1 }
            )
        ])
        const agents = new Map<string, number>()
        for (const id of [...jobs.flatMap(job => componentsOfJob(job).map(ref => ref.id)), ...requests.map(componentIdOf)]) {
            agents.set(id, (agents.get(id) ?? 0) + 1)
        }
        // A domain-scoped member is told about the microfrontends and services they see only
        const inScope = await this.domainScopeFilter(projectId)
        if (Object.keys(inScope).length > 0) {
            const projectFilter = { projectId: toObjectId(projectId), ...inScope }
            const visible = new Set((await Promise.all([Microfrontend.find(projectFilter, { _id: 1 }), Service.find(projectFilter, { _id: 1 })])).flat().map(component => String(component._id)))
            for (const id of agents.keys()) if (!visible.has(id)) agents.delete(id)
        }
        return [...agents].map(([microfrontendId, count]) => ({ microfrontendId, agents: count }))
    }

    /**
     * Brings every proposal of a finished job onto its base branch in the background, one after the
     * other. Every proposal is claimed (APPLYING) before answering, so a second click finds
     * nothing left; each then ends APPLIED, or back to PROPOSED with its error.
     */
    async apply(jobId: string): Promise<AiJobView> {
        const job = await this.getJob(jobId)
        await this.ensureCanChangeProject(job.projectId)
        if (job.status !== AiJobStatus.DONE) throw notDone()

        const requests = await AiChangeRequest.find({ jobId: job._id })
        const order = componentsOfJob(job).map(ref => ref.id)
        requests.sort((a, b) => order.indexOf(componentIdOf(a)) - order.indexOf(componentIdOf(b)))
        const candidates = requests.filter(request => request.status === AiChangeStatus.PROPOSED && request.files.length > 0)
        for (const request of candidates) await ensureNotBeingRefined(request)
        await this.ensureRepositoriesInDomainScope(job.projectId, candidates.map(componentOf))

        const claimed: { request: IAiChangeRequest; files: IAiChangeFile[] }[] = []
        for (const request of candidates) {
            let files: IAiChangeFile[]
            try {
                files = this.filesToCommit(request)
            } catch (error) {
                await AiChangeRequest.updateOne({ _id: request._id, status: AiChangeStatus.PROPOSED }, { error: toErrorMessage(error) })
                continue
            }
            // The status flip is the guard against a double click: only one apply leaves PROPOSED.
            if (await AiChangeRequest.findOneAndUpdate({ _id: request._id, status: AiChangeStatus.PROPOSED }, { status: AiChangeStatus.APPLYING, $unset: { error: 1 } }))
                claimed.push({ request, files })
        }

        if (claimed.length) {
            await AiChangeJob.updateOne({ _id: job._id }, event("info", "applying"))
            // Detached on purpose: a push per repository takes a while, the console follows it by polling.
            this.applyAll(claimed).catch(error => fastify.log.error({ error: loggable(error), aiJobId: jobId }, "AI job apply crashed"))
        }
        return this.view((await AiChangeJob.findById(job._id)) ?? job, true)
    }

    private async applyAll(claimed: { request: IAiChangeRequest; files: IAiChangeFile[] }[]) {
        for (const { request, files } of claimed) {
            try {
                await this.applyClaimed(request, files)
            } catch (error) {
                // Kept on the request, back to a proposal: the others are applied anyway.
                fastify.log.warn({ error: loggable(error), aiChangeId: String(request._id) }, "AI job could not apply a proposal")
            }
        }
    }
}

export default AiChangeJobService
