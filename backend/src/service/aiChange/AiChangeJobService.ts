import fs from "node:fs/promises"
import path from "node:path"
import { Types } from "mongoose"
import { fastify } from "../.."
import { createBusinessException } from "../../errors/BusinessException"
import { EntityNotFoundError } from "../../errors/EntityNotFoundError"
import AiChangeJob, { AiJobScope, AiJobStatus, IAiChangeJob } from "../../models/AiChangeJobModel"
import AiChangeRequest, { AI_CHANGE_MAX_EVENTS, AiChangeFileAction, AiChangeStatus, IAiChangeEvent, IAiChangeFile, IAiChangeRequest } from "../../models/AiChangeRequestModel"
import Project, { IProject } from "../../models/ProjectModel"
import { toObjectId } from "../../utils/mongooseUtils"
import { withRepositoryLock } from "../../utils/repositoryLock"
import { isProtectedPath, resolveInsideWorkingCopy } from "../../utils/workspacePaths"
import { ResolvedAiModel } from "../AiModelService"
import { redactSecrets } from "../assistant/assistantTools"
import { addUsage, aiProviderError, LlmClient, LlmEffort, LlmUsage, NO_USAGE, resolveEffort } from "../llm"
import { RepositoryFileService, toErrorMessage } from "../RepositoryFileService"
import RepositoryWorkspaceService, { OpenedWorkspace } from "../workspace/RepositoryWorkspaceService"
import { findComponents, fromMicrofrontend, RepositoryComponent } from "../workspace/repositoryComponent"
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
    microfrontendIds?: string[]
    /** The branch each repository starts from, by microfrontend id: its default branch when left out. */
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
    /** How hard the agent reasons: the parent's effort when left out. */
    effort?: LlmEffort
    /** The AI the agent runs on: the parent's when left out and the project may still use it, else the project's default. */
    aiModelId?: string
}

export interface AiJobRepositoryView {
    requestId: string
    microfrontendId: string
    microfrontendName: string
    microfrontendSlug: string
    /** The repository on its provider, unset when the microfrontend has none any more. */
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

/** The agents at work on one microfrontend: the console animates its card while any is. */
export interface AiWorkingAgentsView {
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
        message: `A job works on at most ${MAX_REPOSITORIES_PER_JOB} repositories: select the microfrontends to change`,
        statusCode: 422
    })

const noRepositories = (message: string) => createBusinessException({ code: "AI_JOB_NO_REPOSITORIES", message, statusCode: 422 })

const notDone = () => createBusinessException({ code: "AI_JOB_NOT_DONE", message: "The job has not finished yet", statusCode: 409 })

const expiry = () => new Date(Date.now() + PROPOSAL_TTL_MS)

const event = (kind: IAiChangeEvent["kind"], message: string) => ({ $push: { events: { $each: [{ at: new Date(), kind, message }], $slice: -AI_CHANGE_MAX_EVENTS } } })

/** Whether a working copy holds exactly the files a follow-up started from: the agent changed nothing of its own. */
const sameFiles = (previous: IAiChangeFile[], files: IAiChangeFile[]) =>
    files.length === previous.length &&
    files.every(file => previous.some(candidate => candidate.path === file.path && candidate.action === file.action && candidate.proposedContent === file.proposedContent))

/** What the agent is told of a repository: its microfrontend, whose slug the paths of a multi-repository job start with. */
const agentRepository = (component: RepositoryComponent, rest: Omit<AiChangeAgentRepository, "microfrontend">): AiChangeAgentRepository => ({
    ...rest,
    microfrontend: { name: component.name, slug: component.slug, framework: component.framework, compiler: component.compiler, context: component.context }
})

/** The microfrontends of a job, as ids in the order they are shown. */
const microfrontendsOf = (job: Pick<IAiChangeJob, "microfrontendIds">) => job.microfrontendIds.map(id => String(id))

/** Whether two jobs work on the same repositories in the same order: the paths the agent knows then still point where they did. */
const sameRepositories = (a: IAiChangeJob, b: IAiChangeJob) => microfrontendsOf(a).join(",") === microfrontendsOf(b).join(",")

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
    status: job.status,
    effort: job.effort ?? AI_CHANGE_DEFAULT_EFFORT,
    aiModelId: job.aiModelId,
    events: withEvents ? (job.events ?? []).map(entry => ({ at: entry.at, kind: entry.kind, message: entry.message })) : undefined,
    summary: job.summary,
    error: job.error,
    usage: { inputTokens: job.usage?.inputTokens ?? 0, cachedInputTokens: job.usage?.cachedInputTokens ?? 0, outputTokens: job.usage?.outputTokens ?? 0 },
    repositories: microfrontendsOf(job).flatMap(id => {
        // A request nobody acted upon expires: the job then only lists the others.
        const request = requests.find(candidate => String(candidate.jobId) === String(job._id) && String(candidate.microfrontendId) === id)
        if (!request) return []
        const component = components.get(id)
        return [
            {
                requestId: String(request._id),
                microfrontendId: id,
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
    /** The microfrontends of the project whose repository connection, of this same project, the workspace can open. */
    private async repositoriesOf(projectId: string): Promise<RepositoryComponent[]> {
        const targets = await new RepositoryFileService(this.user).resolveTargets(projectId)
        return targets
            .filter(target => target.codeRepository && target.repositoryName && target.codeRepository.projectId?.toString() === projectId)
            .map(target => fromMicrofrontend(target.microfrontend))
    }

    private async selectRepositories(projectId: string, input: AiJobCreateInput): Promise<RepositoryComponent[]> {
        const available = await this.repositoriesOf(projectId)
        if (input.scope === "global") {
            if (available.length === 0) throw noRepositories("No microfrontend of the project has a code repository connected")
            if (available.length > MAX_REPOSITORIES_PER_JOB) throw tooMany()
            return available
        }

        const ids = [...new Set(input.microfrontendIds ?? [])]
        if (ids.length === 0) throw noRepositories("Select at least one microfrontend")
        if (ids.length > MAX_REPOSITORIES_PER_JOB) throw tooMany()
        const inProject = (await findComponents(ids, { name: 1, projectId: 1 })).filter(component => String(component.projectId) === projectId)
        const missing = ids.find(id => !inProject.some(component => String(component._id) === id))
        if (missing) throw new EntityNotFoundError(missing)
        const withoutRepository = inProject.filter(component => !available.some(candidate => String(candidate._id) === String(component._id)))
        if (withoutRepository.length) {
            throw noRepositories(`No code repository is connected to ${withoutRepository.map(component => component.name).join(", ")}`)
        }
        return ids.map(id => available.find(component => String(component._id) === id)!)
    }

    /** Starts a job on every microfrontend of the project with a repository, or on the selected ones. */
    async create(projectId: string, input: AiJobCreateInput): Promise<AiJobView> {
        await this.ensureCanChangeProject(toObjectId(projectId))
        const aiModel = await this.aiModels().resolveForProject(projectId, input.aiModelId)
        const components = await this.selectRepositories(projectId, input)

        const workspaceService = new RepositoryWorkspaceService(this.user)
        // Opened even when a branch is picked: it is what refuses a repository connection of another project.
        const repositories = await Promise.all(
            components.map(async component => {
                const { defaultBranch } = await workspaceService.open(component)
                return { component, baseBranch: input.baseBranches?.[String(component._id)]?.trim() || defaultBranch }
            })
        )
        const { job } = await this.start({ projectId: toObjectId(projectId), prompt: input.prompt, scope: input.scope, repositories, effort: input.effort }, aiModel)
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
        const requestOf = (microfrontendId: string) => parentRequests.find(request => String(request.microfrontendId) === microfrontendId)
        const parentIds = microfrontendsOf(parent)
        const requested = [...new Set(input.microfrontendIds ?? [])]
        const ids = requested.length ? requested : parentIds.filter(id => requestOf(id)?.status === AiChangeStatus.PROPOSED)
        if (ids.length === 0) {
            throw createBusinessException({ code: "AI_CHANGE_NOT_PROPOSED", message: "No proposal of this job is left to refine", statusCode: 409 })
        }

        const components = await findComponents(parentIds.filter(id => ids.includes(id)))
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

        const scope = repositories.length === parentIds.length ? parent.scope : "selection"
        const { job } = await this.start({ projectId: parent.projectId, prompt: input.prompt, scope, repositories, parentJob: parent, effort: input.effort }, aiModel)
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
            effort,
            aiModelId: settings.id,
            microfrontendIds: input.repositories.map(({ component }) => component._id),
            status: AiJobStatus.PENDING,
            events: queued()
        })
        const requests = await Promise.all(
            input.repositories.map(repository =>
                AiChangeRequest.create({
                    projectId: input.projectId,
                    microfrontendId: repository.component._id,
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
        const parent = await AiChangeJob.findById(job.parentJobId, { transcript: 1, microfrontendIds: 1 })
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
            const requests = await AiChangeRequest.find({ jobId: job._id })
            const ids = microfrontendsOf(job)
            const components = await findComponents(ids)
            const workspaceService = new RepositoryWorkspaceService(this.user)
            const repositories: RunningRepository[] = []
            for (const id of ids) {
                const component = components.find(candidate => String(candidate._id) === id)
                const request = requests.find(candidate => String(candidate.microfrontendId) === id)
                if (!component || !request) throw new Error("A microfrontend of the job no longer exists")
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
                    : this.work(job, project, repositories, workspaceService, client, delta => {
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
            // The agent may stop midway, the provider failing or its answer cut off: what it wrote until then is still proposed.
            let stopped: string | undefined
            const result = await runAiChangeAgent(
                client,
                {
                    prompt: job.prompt,
                    effort: job.effort,
                    project: { name: project.name, context: project.context },
                    repositories: repositories.map(({ component, request, workspace, previousFiles }) =>
                        agentRepository(component, {
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
        return this.failIfStale(job)
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
        const ids = [...new Set(jobs.flatMap(microfrontendsOf))]
        const components = await findComponents(ids, { name: 1, slug: 1, "codeRepository.name": 1, "codeRepository.cloneUrlHttps": 1 })
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
        const jobs = await AiChangeJob.find({ rootJobId: job.rootJobId, projectId: job.projectId }, { transcript: 0 }).sort({ createdAt: 1 })
        return this.views(await Promise.all(jobs.map(candidate => this.failIfStale(candidate))), true)
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
        const listed = await AiChangeJob.find(filter, JOB_LISTED).sort({ createdAt: -1 }).limit(LISTED_JOBS)
        const jobs = await Promise.all(listed.map(job => this.failIfStale(job)))
        const views = await this.views(jobs, false)
        return active ? views.filter(view => ACTIVE_JOB_STATUSES.includes(view.status) || view.repositories.some(repository => repository.status === AiChangeStatus.PROPOSED)) : views
    }

    /**
     * How many agents are working on each microfrontend of the project right now, whoever started them: a
     * job counts on every repository it works on, a change asked from the microfrontend page on its own.
     * A job is fresh by its own date, its requests are not touched while it runs.
     */
    async working(projectId: string): Promise<AiWorkingAgentsView[]> {
        await this.ensureAccessToProject(toObjectId(projectId))
        const fresh = { $gt: new Date(Date.now() - STALE_AFTER_MS) }
        const [jobs, requests] = await Promise.all([
            AiChangeJob.find({ projectId: toObjectId(projectId), status: { $in: ACTIVE_JOB_STATUSES }, updatedAt: fresh }, { microfrontendIds: 1 }),
            AiChangeRequest.find(
                { projectId: toObjectId(projectId), jobId: { $exists: false }, status: { $in: [AiChangeStatus.PENDING, AiChangeStatus.RUNNING] }, updatedAt: fresh },
                { microfrontendId: 1 }
            )
        ])
        const agents = new Map<string, number>()
        for (const id of [...jobs.flatMap(microfrontendsOf), ...requests.map(request => String(request.microfrontendId))]) {
            agents.set(id, (agents.get(id) ?? 0) + 1)
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
        const order = microfrontendsOf(job)
        requests.sort((a, b) => order.indexOf(String(a.microfrontendId)) - order.indexOf(String(b.microfrontendId)))
        const candidates = requests.filter(request => request.status === AiChangeStatus.PROPOSED && request.files.length > 0)
        for (const request of candidates) await ensureNotBeingRefined(request)

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
