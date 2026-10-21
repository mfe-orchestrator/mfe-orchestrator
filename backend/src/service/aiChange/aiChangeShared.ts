import { fastify } from "../.."
import { createBusinessException } from "../../errors/BusinessException"
import { EntityNotFoundError } from "../../errors/EntityNotFoundError"
import AiChangeJob from "../../models/AiChangeJobModel"
import AiChangeRequest, { AiChangeStatus, IAiChangeFile, IAiChangeRequest } from "../../models/AiChangeRequestModel"
import { IMicrofrontend } from "../../models/MicrofrontendModel"
import Project from "../../models/ProjectModel"
import UserProject, { RoleInProject } from "../../models/UserProjectModel"
import { withRepositoryLock } from "../../utils/repositoryLock"
import { isProtectedPath } from "../../utils/workspacePaths"
import AiModelService from "../AiModelService"
import BaseAuthorizedService from "../BaseAuthorizedService"
import { LlmConfiguration } from "../llm"
import { toErrorMessage } from "../RepositoryFileService"
import { isPushRefused } from "../workspace/GitWorkingCopy"
import RepositoryWorkspaceService, { OpenedWorkspace } from "../workspace/RepositoryWorkspaceService"
import { findComponent } from "../workspace/repositoryComponent"

/** Proposals nobody approves or discards are removed after this, and so are finished jobs. */
export const PROPOSAL_TTL_MS = 7 * 24 * 60 * 60 * 1000
/** A job that has not written anything for this long died with its process. */
export const STALE_AFTER_MS = 20 * 60 * 1000
/** Apply waits for a busy working copy only this long. */
const APPLY_LOCK_WAIT_MS = 30_000
/** Content kept for the diff of a file; beyond it the original is not stored (the document has a 16 MB cap). */
const MAX_STORED_ORIGINAL_BYTES = 300_000

const ACTIVE_STATUSES = [AiChangeStatus.PENDING, AiChangeStatus.RUNNING, AiChangeStatus.APPLYING]

/**
 * What gets logged of an error. Never the error object itself: an axios error carries the request
 * config, headers included, and with them the provider token.
 */
export const loggable = (error: unknown) => ({ message: toErrorMessage(error), status: (error as { response?: { status?: number } })?.response?.status })

/** A stale job is reported as failed; an apply that died goes back to the proposal, which is still valid. */
export const staleOutcome = (request: Pick<IAiChangeRequest, "status" | "updatedAt">) =>
    ACTIVE_STATUSES.includes(request.status) && Date.now() - request.updatedAt.getTime() > STALE_AFTER_MS
        ? request.status === AiChangeStatus.APPLYING
            ? AiChangeStatus.PROPOSED
            : AiChangeStatus.FAILED
        : undefined

export const storable = (content: string | undefined) => (content !== undefined && !content.includes("\0") && Buffer.byteLength(content) <= MAX_STORED_ORIGINAL_BYTES ? content : undefined)

export const followUpRunning = (message: string) => createBusinessException({ code: "AI_JOB_FOLLOW_UP_RUNNING", message, statusCode: 409 })

/** A proposal a running follow-up is refining cannot be applied: the follow-up is about to replace it. */
export const ensureNotBeingRefined = async (request: Pick<IAiChangeRequest, "_id">) => {
    const child = await AiChangeRequest.exists({
        parentId: request._id,
        status: { $in: [AiChangeStatus.PENDING, AiChangeStatus.RUNNING] },
        updatedAt: { $gt: new Date(Date.now() - STALE_AFTER_MS) }
    })
    if (child) throw followUpRunning("A follow-up is refining this proposal: wait for it to finish")
}

export const firstLine = (text: string, max: number) => {
    const line = text.trim().split("\n")[0].trim()
    return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

export const timestamp = (date = new Date()) => date.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15)

/** How far back the messages of a conversation are looked up for its pull request. */
const MAX_CONVERSATION_LENGTH = 50

/** The feature branch of a conversation on one repository. */
export const branchName = (slug: string) => `ai/${slug}-${timestamp()}`

/** Who a commit is by: the user who asked for the change, or applied it. */
export const authorOf = (user: { name?: string; surname?: string; email: string }) => ({ name: [user.name, user.surname].filter(Boolean).join(" ") || user.email, email: user.email })

export const commitMessage = (title: string, summary?: string) => `${title}\n\n${summary ?? ""}`.trim()

export const toCommitFiles = (files: IAiChangeFile[]) => files.map(file => ({ path: file.path, action: file.action, content: file.proposedContent }))

/**
 * What was asked in the conversation that led to a proposal, oldest first: a follow-up ("also translate
 * it") alone would make a poor pull request title.
 */
export const conversationPrompts = async (request: IAiChangeRequest): Promise<string[]> => {
    const prompts = [request.prompt]
    let parentId = request.parentId
    while (parentId && prompts.length < MAX_CONVERSATION_LENGTH) {
        const parent = await AiChangeRequest.findById(parentId, { prompt: 1, parentId: 1 })
        if (!parent) break
        prompts.unshift(parent.prompt)
        parentId = parent.parentId
    }
    return prompts
}

/** Applied work is kept, and so is the conversation that led to it: its jobs and its requests on this repository no longer expire. */
const keepConversation = async (request: IAiChangeRequest) => {
    const job = request.jobId ? await AiChangeJob.findById(request.jobId, { rootJobId: 1 }) : null
    if (!job) return
    const jobIds = (await AiChangeJob.find({ rootJobId: job.rootJobId }, { _id: 1 })).map(candidate => candidate._id)
    await AiChangeJob.updateMany({ _id: { $in: jobIds } }, { $unset: { expiresAt: 1 } })
    await AiChangeRequest.updateMany({ jobId: { $in: jobIds }, microfrontendId: request.microfrontendId }, { $unset: { expiresAt: 1 } })
}

/** What the AI change services share: who may change a project, and how a claimed proposal becomes a pull request. */
export abstract class AiChangeBaseService extends BaseAuthorizedService {
    constructor(
        user: ConstructorParameters<typeof BaseAuthorizedService>[0],
        protected readonly config: LlmConfiguration
    ) {
        super(user)
    }

    /** Where the AI a request runs on is chosen, among those the project may use. */
    protected aiModels() {
        return new AiModelService(this.user, this.config)
    }

    /**
     * Writing to a repository is a change to the project: a VIEWER may look at the proposals but
     * neither ask for one nor apply it. Organization administrators reach every project.
     */
    async ensureCanChangeProject(projectId: IMicrofrontend["projectId"]) {
        await this.ensureAccessToProject(projectId)
        const user = this.getUser()
        if (!user) throw createBusinessException({ code: "AI_CHANGE_FORBIDDEN", message: "Not allowed", statusCode: 403 })
        const membership = await UserProject.findOne({ userId: user._id, projectId, invitationToken: null })
        if (membership?.role !== RoleInProject.VIEWER) return
        const project = await Project.findById(projectId, { organizationId: 1 })
        if (project && (await this.isOrganizationAdmin(project.organizationId))) return
        throw createBusinessException({ code: "AI_CHANGE_FORBIDDEN", message: "A viewer cannot change the code of a microfrontend", statusCode: 403 })
    }

    /** The files of a proposal that will be committed, refused when none is left or one cannot be. */
    protected filesToCommit(request: IAiChangeRequest): IAiChangeFile[] {
        const files = request.files
        if (files.length === 0) {
            throw createBusinessException({ code: "AI_CHANGE_NOTHING_TO_APPLY", message: "No file left to commit", statusCode: 400 })
        }
        const invalid = files.find(file => isProtectedPath(file.path) || (file.action !== "delete" && file.proposedContent === undefined))
        if (invalid) {
            throw createBusinessException({ code: "AI_CHANGE_INVALID_FILE", message: `"${invalid.path}" cannot be committed`, statusCode: 422 })
        }
        return files
    }

    /**
     * Resets the working copy to the latest base and checks every file is still what the agent saw: a
     * file changed on the remote since would otherwise be silently overwritten. Returns the base's head.
     */
    private async latestBase(workspaceService: RepositoryWorkspaceService, workspace: OpenedWorkspace, request: IAiChangeRequest, files: IAiChangeFile[]): Promise<string> {
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
        return head
    }

    /**
     * Brings the files of a request already claimed (APPLYING) onto its base branch. The request ends
     * APPLIED, or back to PROPOSED with the error, which is thrown.
     *
     * When the base has not moved since the proposal, the base fast-forwards to the very commit of the
     * feature branch, so a pull request opened from it reads merged. Otherwise the files are committed
     * again on top of the latest base. The push is never forced: a protected base turns it down, and
     * the user opens a pull request instead.
     */
    protected async applyClaimed(request: IAiChangeRequest, files: IAiChangeFile[]): Promise<IAiChangeRequest> {
        const component = await findComponent(String(request.microfrontendId))
        const user = this.getUser()!
        try {
            if (!component) throw new EntityNotFoundError(String(request.microfrontendId))
            const workspaceService = new RepositoryWorkspaceService(this.user)
            const workspace = await workspaceService.open(component)
            const prompts = await conversationPrompts(request)

            const result = await withRepositoryLock(
                workspace.workingCopy.dir,
                async () => {
                    const head = await this.latestBase(workspaceService, workspace, request, files)
                    let commit: string
                    try {
                        if (request.commit && head === request.baseCommit && (await workspace.workingCopy.hasCommit(request.commit))) {
                            await workspace.workingCopy.pushCommit(request.commit, request.baseBranch)
                            commit = request.commit
                        } else {
                            commit = await workspace.workingCopy.commitAndPush({
                                branch: request.branch ?? branchName(component.slug),
                                pushTo: request.baseBranch,
                                message: commitMessage(firstLine(prompts[0], 72), request.summary),
                                author: authorOf(user),
                                files: toCommitFiles(files)
                            })
                        }
                    } catch (error) {
                        if (!isPushRefused(error)) throw error
                        throw createBusinessException({
                            code: "AI_CHANGE_PUSH_REFUSED",
                            message: `${request.baseBranch} refused the push (${toErrorMessage(error)}): if it is protected, open a pull request instead`,
                            statusCode: 409
                        })
                    }
                    // Its work is on the base now. One with a pull request is left to it: deleting it would close the pull request on some providers.
                    if (request.branch && request.commit && !request.pullRequestUrl) {
                        await workspace.workingCopy
                            .deleteRemoteBranch(request.branch)
                            .catch(error => fastify.log.warn({ error: loggable(error), aiChangeId: String(request._id) }, "Could not delete the branch of an applied change"))
                    }
                    return { commit }
                },
                { waitMs: APPLY_LOCK_WAIT_MS }
            )

            const applied = await AiChangeRequest.findByIdAndUpdate(
                request._id,
                { status: AiChangeStatus.APPLIED, ...result, $unset: { expiresAt: 1, pushError: 1 }, $push: { events: { at: new Date(), kind: "info", message: "applied" } } },
                { new: true }
            )
            // The push is done: failing to keep the history must not turn the request back into a proposal.
            await keepConversation(request).catch(error => fastify.log.warn({ error: loggable(error), aiChangeId: String(request._id) }, "Could not keep the AI conversation"))
            return applied!
        } catch (error) {
            await AiChangeRequest.updateOne({ _id: request._id }, { status: AiChangeStatus.PROPOSED, error: toErrorMessage(error) })
            throw error
        }
    }

    /**
     * Opens a pull request from the feature branch of a proposal onto its base, for a review in the
     * repository before it reaches the base. The proposal stays open: a follow-up force-pushes the
     * branch, so the pull request follows it. A proposal whose push failed is pushed first, from the
     * latest base. A provider refusing the pull request leaves its error on the request, which is returned.
     * `related` lists the other repositories of the same job, one per line.
     */
    protected async openPullRequestFor(request: IAiChangeRequest, files: IAiChangeFile[], related: string[] = []): Promise<IAiChangeRequest> {
        const component = await findComponent(String(request.microfrontendId))
        if (!component) throw new EntityNotFoundError(String(request.microfrontendId))
        const user = this.getUser()!
        const workspaceService = new RepositoryWorkspaceService(this.user)
        const workspace = await workspaceService.open(component)
        const prompts = await conversationPrompts(request)
        const title = firstLine(prompts[0], 72)

        let branch = request.branch
        if (!branch || !request.commit) {
            const pushed = await withRepositoryLock(
                workspace.workingCopy.dir,
                async () => {
                    await this.latestBase(workspaceService, workspace, request, files)
                    const name = request.branch ?? branchName(component.slug)
                    const commit = await workspace.workingCopy.commitAndPush({ branch: name, message: commitMessage(title, request.summary), author: authorOf(user), files: toCommitFiles(files) })
                    return { branch: name, commit }
                },
                { waitMs: APPLY_LOCK_WAIT_MS }
            )
            await AiChangeRequest.updateOne({ _id: request._id }, { ...pushed, $unset: { pushError: 1 } })
            branch = pushed.branch
        }

        try {
            const pullRequestUrl = await workspaceService.openPullRequest(workspace.target, {
                sourceBranch: branch,
                targetBranch: request.baseBranch,
                title,
                description: [
                    request.summary,
                    related.length ? `Part of a change across ${related.length + 1} repositories:\n${related.map(line => `- ${line}`).join("\n")}` : undefined,
                    `---\nRequested in MFE Orchestrator by ${user.email}:\n\n${prompts.map(prompt => `> ${prompt.split("\n").join("\n> ")}`).join("\n\n")}`
                ]
                    .filter(Boolean)
                    .join("\n\n")
            })
            const opened = await AiChangeRequest.findByIdAndUpdate(request._id, { pullRequestUrl, $unset: { pullRequestError: 1 } }, { new: true })
            // A follow-up started meanwhile pushes the same branch: it carries the pull request on, or applying it would delete the branch under it.
            await AiChangeRequest.updateMany(
                {
                    conversationId: request.conversationId,
                    microfrontendId: request.microfrontendId,
                    branch,
                    status: { $in: [AiChangeStatus.PENDING, AiChangeStatus.RUNNING, AiChangeStatus.PROPOSED] },
                    pullRequestUrl: { $exists: false }
                },
                { pullRequestUrl }
            )
            return opened!
        } catch (error) {
            // The branch is pushed: the change is not lost, the user can open the pull request by hand.
            fastify.log.warn({ error: loggable(error), aiChangeId: String(request._id) }, "Could not open the pull request")
            return (await AiChangeRequest.findByIdAndUpdate(request._id, { pullRequestError: toErrorMessage(error) }, { new: true }))!
        }
    }

    /** Deletes the feature branch of a discarded proposal, unless a pull request is open on it. Best effort: a branch left behind harms nobody. */
    protected async dropBranch(request: IAiChangeRequest): Promise<void> {
        if (!request.branch || !request.commit || request.pullRequestUrl) return
        const component = await findComponent(String(request.microfrontendId))
        if (!component) return
        const workspace = await new RepositoryWorkspaceService(this.user).open(component)
        await workspace.workingCopy.deleteRemoteBranch(request.branch)
    }
}
