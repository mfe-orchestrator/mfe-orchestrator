import { fastify } from "../.."
import { createBusinessException } from "../../errors/BusinessException"
import { EntityNotFoundError } from "../../errors/EntityNotFoundError"
import AiChangeRequest, { AI_CHANGE_MAX_EVENTS, AiChangeStatus, IAiChangeEvent, IAiChangeFile, IAiChangeRequest } from "../../models/AiChangeRequestModel"
import Microfrontend, { IMicrofrontend } from "../../models/MicrofrontendModel"
import Project from "../../models/ProjectModel"
import UserProject, { RoleInProject } from "../../models/UserProjectModel"
import { toObjectId } from "../../utils/mongooseUtils"
import { withRepositoryLock } from "../../utils/repositoryLock"
import { isProtectedPath } from "../../utils/workspacePaths"
import { getClient } from "../assistant/AssistantService"
import BaseAuthorizedService from "../BaseAuthorizedService"
import { toErrorMessage } from "../RepositoryFileService"
import { GitWorkingCopy } from "../workspace/GitWorkingCopy"
import RepositoryWorkspaceService from "../workspace/RepositoryWorkspaceService"
import { runAiChangeAgent } from "./aiChangeAgent"

/** Proposals nobody approves or discards are removed after this. */
const PROPOSAL_TTL_MS = 7 * 24 * 60 * 60 * 1000
/** A job that has not written anything for this long died with its process. */
const STALE_AFTER_MS = 20 * 60 * 1000
/** Apply runs inside the request: it waits for a busy working copy only this long. */
const APPLY_LOCK_WAIT_MS = 30_000
/** Content kept for the diff of a file; beyond it the original is not stored (the document has a 16 MB cap). */
const MAX_STORED_ORIGINAL_BYTES = 300_000

const ACTIVE_STATUSES = [AiChangeStatus.PENDING, AiChangeStatus.RUNNING, AiChangeStatus.APPLYING]
/** Agents running or queued at once in one project: each one is minutes of paid model time. */
const MAX_ACTIVE_PER_PROJECT = 3

/**
 * What gets logged of an error. Never the error object itself: an axios error carries the request
 * config, headers included, and with them the provider token.
 */
const loggable = (error: unknown) => ({ message: toErrorMessage(error), status: (error as { response?: { status?: number } })?.response?.status })

/** A stale job is reported as failed; an apply that died goes back to the proposal, which is still valid. */
const staleOutcome = (request: Pick<IAiChangeRequest, "status" | "updatedAt">) =>
    ACTIVE_STATUSES.includes(request.status) && Date.now() - request.updatedAt.getTime() > STALE_AFTER_MS
        ? request.status === AiChangeStatus.APPLYING
            ? AiChangeStatus.PROPOSED
            : AiChangeStatus.FAILED
        : undefined

export interface AiChangeCreateInput {
    prompt: string
    baseBranch?: string
}

export interface AiChangeApplyInput {
    /** Proposed files the user unticked: they are left out of the commit. */
    excludePaths?: string[]
}

const storable = (content: string | undefined) => (content !== undefined && !content.includes("\0") && Buffer.byteLength(content) <= MAX_STORED_ORIGINAL_BYTES ? content : undefined)

const firstLine = (text: string, max: number) => {
    const line = text.trim().split("\n")[0].trim()
    return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

const timestamp = (date = new Date()) => date.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15)

/**
 * Code changes to a microfrontend proposed by an AI agent and applied as a pull request.
 *
 * The agent works on the local working copy of the repository and never pushes: its changes are
 * stored here as a proposal and the copy is reset. Only {@link apply}, a user's explicit action,
 * writes to the remote, and only on a new branch with a pull request.
 */
export class AiChangeService extends BaseAuthorizedService {
    constructor(
        user: ConstructorParameters<typeof BaseAuthorizedService>[0],
        private readonly apiKey?: string
    ) {
        super(user)
    }

    /**
     * Writing to a repository is a change to the project: a VIEWER may look at the proposals but
     * neither ask for one nor apply it. Organization administrators reach every project.
     */
    private async ensureCanChangeProject(projectId: IMicrofrontend["projectId"]) {
        await this.ensureAccessToProject(projectId)
        const user = this.getUser()
        if (!user) throw createBusinessException({ code: "AI_CHANGE_FORBIDDEN", message: "Not allowed", statusCode: 403 })
        const membership = await UserProject.findOne({ userId: user._id, projectId, invitationToken: null })
        if (membership?.role !== RoleInProject.VIEWER) return
        const project = await Project.findById(projectId, { organizationId: 1 })
        if (project && (await this.isOrganizationAdmin(project.organizationId))) return
        throw createBusinessException({ code: "AI_CHANGE_FORBIDDEN", message: "A viewer cannot change the code of a microfrontend", statusCode: 403 })
    }

    private async getMicrofrontend(microfrontendId: string): Promise<IMicrofrontend> {
        const microfrontend = await Microfrontend.findById(microfrontendId)
        if (!microfrontend) throw new EntityNotFoundError(microfrontendId)
        await this.ensureAccessToMicrofrontend(microfrontend)
        return microfrontend
    }

    private async getRequest(id: string): Promise<IAiChangeRequest> {
        const request = await AiChangeRequest.findById(id)
        if (!request) throw new EntityNotFoundError(id)
        await this.ensureAccessToProject(request.projectId)
        return request
    }

    async create(microfrontendId: string, input: AiChangeCreateInput): Promise<IAiChangeRequest> {
        const client = getClient(this.apiKey)
        const microfrontend = await this.getMicrofrontend(microfrontendId)
        await this.ensureCanChangeProject(microfrontend.projectId)
        const workspace = await new RepositoryWorkspaceService(this.user).open(microfrontendId)

        const active = await AiChangeRequest.countDocuments({ projectId: microfrontend.projectId, status: { $in: ACTIVE_STATUSES }, updatedAt: { $gt: new Date(Date.now() - STALE_AFTER_MS) } })
        if (active >= MAX_ACTIVE_PER_PROJECT) {
            throw createBusinessException({ code: "AI_CHANGE_TOO_MANY", message: `At most ${MAX_ACTIVE_PER_PROJECT} AI changes can run at once in a project`, statusCode: 429 })
        }

        const request = await AiChangeRequest.create({
            projectId: microfrontend.projectId,
            microfrontendId: microfrontend._id,
            userId: this.getUser()!._id,
            prompt: input.prompt,
            baseBranch: input.baseBranch?.trim() || workspace.defaultBranch,
            status: AiChangeStatus.PENDING,
            events: [{ at: new Date(), kind: "info", message: "queued" }]
        })

        // Detached on purpose: the agent takes minutes, the console follows it by polling.
        this.process(request._id.toString(), client).catch(error => fastify.log.error({ error: loggable(error), aiChangeId: request._id }, "AI change job crashed"))
        return request
    }

    private async log(id: string, kind: IAiChangeEvent["kind"], message: string) {
        await AiChangeRequest.updateOne({ _id: toObjectId(id) }, { $push: { events: { $each: [{ at: new Date(), kind, message }], $slice: -AI_CHANGE_MAX_EVENTS } } })
    }

    /** The job: lock the working copy, reset it, let the agent work, store what changed, reset again. */
    private async process(id: string, client: ReturnType<typeof getClient>): Promise<void> {
        const request = await AiChangeRequest.findById(id)
        if (!request) return
        const microfrontend = await Microfrontend.findById(request.microfrontendId)
        const project = await Project.findById(request.projectId)
        if (!microfrontend || !project) {
            await AiChangeRequest.updateOne({ _id: toObjectId(id) }, { status: AiChangeStatus.FAILED, error: "The microfrontend no longer exists" })
            return
        }

        let workingCopy: GitWorkingCopy | undefined
        try {
            const workspaceService = new RepositoryWorkspaceService(this.user)
            const workspace = await workspaceService.open(microfrontend._id.toString())
            workingCopy = workspace.workingCopy

            // Locked by folder, not by microfrontend: the folder is what two jobs must not share.
            await withRepositoryLock(
                workspace.workingCopy.dir,
                async () => {
                    await AiChangeRequest.updateOne({ _id: toObjectId(id) }, { status: AiChangeStatus.RUNNING })
                    await this.log(id, "info", "preparing")
                    const baseCommit = await workspaceService.prepare(workspace, request.baseBranch)
                    await AiChangeRequest.updateOne({ _id: toObjectId(id) }, { baseCommit })
                    await this.log(id, "info", "working")

                    const result = await runAiChangeAgent(
                        client,
                        workspace.workingCopy,
                        {
                            prompt: request.prompt,
                            baseBranch: request.baseBranch,
                            project: { name: project.name, context: project.context },
                            microfrontend: {
                                name: microfrontend.name,
                                slug: microfrontend.slug,
                                framework: microfrontend.stack?.framework,
                                compiler: microfrontend.stack?.compiler,
                                context: microfrontend.context
                            }
                        },
                        {
                            onEvent: (kind, message) => this.log(id, kind, message),
                            onUsage: usage =>
                                AiChangeRequest.updateOne({ _id: toObjectId(id) }, { $inc: { "usage.inputTokens": usage.inputTokens, "usage.outputTokens": usage.outputTokens } }).then(() => undefined)
                        }
                    )

                    if (result.stopReason === "refusal") throw new Error("The model declined this request")
                    if (result.stopReason === "max_tokens") throw new Error("The agent's answer was cut off: try a smaller request")

                    const files: IAiChangeFile[] = []
                    for (const change of await workspace.workingCopy.changes()) {
                        // The toolbox refuses these already; checked again on what actually changed on disk.
                        if (isProtectedPath(change.path)) throw new Error(`The agent changed a protected file: ${change.path}`)
                        files.push({
                            path: change.path,
                            action: change.action,
                            baseBlobOid: change.baseBlobOid,
                            originalContent: change.action === "create" ? undefined : storable(await workspace.workingCopy.readHeadFile(change.path)),
                            proposedContent: change.action === "delete" ? undefined : await workspace.workingCopy.readWorkingFile(change.path)
                        })
                    }
                    // Guarded: a job get() already declared dead must not come back to life.
                    await AiChangeRequest.updateOne(
                        { _id: toObjectId(id), status: AiChangeStatus.RUNNING },
                        {
                            status: AiChangeStatus.PROPOSED,
                            files,
                            summary: result.summary || undefined,
                            error: result.stopReason === "max_rounds" ? "The agent ran out of steps: the proposal may be incomplete" : undefined,
                            expiresAt: new Date(Date.now() + PROPOSAL_TTL_MS)
                        }
                    )
                    await this.log(id, "info", files.length ? "proposed" : "no-changes")
                    await workspace.workingCopy.discardChanges()
                },
                { onWait: () => this.log(id, "info", "waiting-for-repository") }
            )
        } catch (error) {
            fastify.log.warn({ error: loggable(error), aiChangeId: id }, "AI change failed")
            await AiChangeRequest.updateOne(
                { _id: toObjectId(id), status: { $in: ACTIVE_STATUSES } },
                { status: AiChangeStatus.FAILED, error: toErrorMessage(error), expiresAt: new Date(Date.now() + PROPOSAL_TTL_MS) }
            )
            await workingCopy?.discardChanges().catch(() => undefined)
        }
    }

    /** One request with its files. A job whose process died is reported as failed. */
    async get(id: string): Promise<IAiChangeRequest> {
        const request = await this.getRequest(id)
        const outcome = staleOutcome(request)
        if (outcome) {
            const failed = await AiChangeRequest.findOneAndUpdate({ _id: request._id, status: request.status }, { status: outcome, error: "The job stopped without finishing" }, { new: true })
            return failed ?? request
        }
        return request
    }

    /** The latest requests of a microfrontend, without file contents. */
    async list(microfrontendId: string): Promise<IAiChangeRequest[]> {
        const microfrontend = await this.getMicrofrontend(microfrontendId)
        const requests = await AiChangeRequest.find({ microfrontendId: microfrontend._id }, { "files.originalContent": 0, "files.proposedContent": 0, events: 0 }).sort({ createdAt: -1 }).limit(20)
        for (const request of requests) {
            const outcome = staleOutcome(request)
            if (outcome) request.status = outcome
        }
        return requests
    }

    async discard(id: string): Promise<IAiChangeRequest> {
        const request = await this.getRequest(id)
        await this.ensureCanChangeProject(request.projectId)
        const discarded = await AiChangeRequest.findOneAndUpdate({ _id: request._id, status: AiChangeStatus.PROPOSED }, { status: AiChangeStatus.DISCARDED }, { new: true })
        if (!discarded) throw createBusinessException({ code: "AI_CHANGE_NOT_PROPOSED", message: "Only a proposal can be discarded", statusCode: 409 })
        return discarded
    }

    /**
     * Commits the approved files on a new branch, pushes it and opens a pull request.
     *
     * The working copy is reset to the latest base first, and every file is checked to still be
     * what the agent saw: a file changed on the remote since would otherwise be silently overwritten.
     */
    async apply(id: string, input: AiChangeApplyInput = {}): Promise<IAiChangeRequest> {
        const request = await this.getRequest(id)
        await this.ensureCanChangeProject(request.projectId)

        const excluded = new Set(input.excludePaths ?? [])
        const files = request.files.filter(file => !excluded.has(file.path))
        if (files.length === 0) {
            throw createBusinessException({ code: "AI_CHANGE_NOTHING_TO_APPLY", message: "No file left to commit", statusCode: 400 })
        }
        const invalid = files.find(file => isProtectedPath(file.path) || (file.action !== "delete" && file.proposedContent === undefined))
        if (invalid) {
            throw createBusinessException({ code: "AI_CHANGE_INVALID_FILE", message: `"${invalid.path}" cannot be committed`, statusCode: 422 })
        }

        // The status flip is the guard against a double click: only one apply leaves PROPOSED.
        const claimed = await AiChangeRequest.findOneAndUpdate({ _id: request._id, status: AiChangeStatus.PROPOSED }, { status: AiChangeStatus.APPLYING, $unset: { error: 1 } }, { new: true })
        if (!claimed) throw createBusinessException({ code: "AI_CHANGE_NOT_PROPOSED", message: "This change is not waiting for approval", statusCode: 409 })

        const microfrontend = await Microfrontend.findById(request.microfrontendId)
        const user = this.getUser()!
        try {
            if (!microfrontend) throw new EntityNotFoundError(request.microfrontendId.toString())
            const workspaceService = new RepositoryWorkspaceService(this.user)
            const workspace = await workspaceService.open(microfrontend._id.toString())

            const result = await withRepositoryLock(
                workspace.workingCopy.dir,
                async () => {
                    const head = await workspaceService.prepare(workspace, request.baseBranch)
                    const conflicts: string[] = []
                    for (const file of files) {
                        const current = await workspace.workingCopy.blobOid(head, file.path)
                        if (current !== file.baseBlobOid) conflicts.push(file.path)
                    }
                    if (conflicts.length) {
                        throw createBusinessException({
                            code: "AI_CHANGE_CONFLICT",
                            message: `These files changed on ${request.baseBranch} after the proposal: ${conflicts.join(", ")}. Ask for the change again.`,
                            details: { conflicts },
                            statusCode: 409
                        })
                    }

                    const title = firstLine(request.prompt, 72)
                    // Named once and saved before pushing: an apply retried after a crash pushes to the
                    // same branch (forced, it is ours) instead of leaving a second one behind.
                    const branch = request.branch ?? `ai/${microfrontend.slug}-${timestamp()}`
                    await AiChangeRequest.updateOne({ _id: request._id }, { branch })
                    const commit = await workspace.workingCopy.commitAndPush({
                        branch,
                        message: `${title}\n\n${request.summary ?? ""}`.trim(),
                        author: { name: [user.name, user.surname].filter(Boolean).join(" ") || user.email, email: user.email },
                        files: files.map(file => ({ path: file.path, action: file.action, content: file.proposedContent }))
                    })

                    let pullRequestUrl: string | undefined
                    let pullRequestError: string | undefined
                    try {
                        pullRequestUrl = await workspaceService.openPullRequest(workspace.target, {
                            sourceBranch: branch,
                            targetBranch: request.baseBranch,
                            title,
                            description: [request.summary, `---\nRequested in MFE Orchestrator by ${user.email}:\n\n> ${request.prompt.split("\n").join("\n> ")}`].filter(Boolean).join("\n\n")
                        })
                    } catch (error) {
                        // The branch is pushed: the change is not lost, the user opens the pull request by hand.
                        pullRequestError = toErrorMessage(error)
                        fastify.log.warn({ error: loggable(error), aiChangeId: id }, "Could not open the pull request")
                    }
                    return { branch, commit, pullRequestUrl, pullRequestError }
                },
                { waitMs: APPLY_LOCK_WAIT_MS }
            )

            const applied = await AiChangeRequest.findByIdAndUpdate(
                request._id,
                { status: AiChangeStatus.APPLIED, ...result, $unset: { expiresAt: 1 }, $push: { events: { at: new Date(), kind: "info", message: "applied" } } },
                { new: true }
            )
            return applied!
        } catch (error) {
            await AiChangeRequest.updateOne({ _id: request._id }, { status: AiChangeStatus.PROPOSED, error: toErrorMessage(error) })
            throw error
        }
    }
}

export default AiChangeService
