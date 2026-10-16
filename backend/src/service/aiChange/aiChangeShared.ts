import { fastify } from "../.."
import { createBusinessException } from "../../errors/BusinessException"
import { EntityNotFoundError } from "../../errors/EntityNotFoundError"
import AiChangeRequest, { AiChangeStatus, IAiChangeFile, IAiChangeRequest } from "../../models/AiChangeRequestModel"
import Microfrontend, { IMicrofrontend } from "../../models/MicrofrontendModel"
import Project from "../../models/ProjectModel"
import UserProject, { RoleInProject } from "../../models/UserProjectModel"
import { withRepositoryLock } from "../../utils/repositoryLock"
import { isProtectedPath } from "../../utils/workspacePaths"
import BaseAuthorizedService from "../BaseAuthorizedService"
import { LlmConfiguration } from "../llm"
import { toErrorMessage } from "../RepositoryFileService"
import RepositoryWorkspaceService from "../workspace/RepositoryWorkspaceService"

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

const firstLine = (text: string, max: number) => {
    const line = text.trim().split("\n")[0].trim()
    return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

const timestamp = (date = new Date()) => date.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15)

/** What the AI change services share: who may change a project, and how a claimed proposal becomes a pull request. */
export abstract class AiChangeBaseService extends BaseAuthorizedService {
    constructor(
        user: ConstructorParameters<typeof BaseAuthorizedService>[0],
        protected readonly config: LlmConfiguration
    ) {
        super(user)
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
    protected filesToCommit(request: IAiChangeRequest, excludePaths: string[] = []): IAiChangeFile[] {
        const excluded = new Set(excludePaths)
        const files = request.files.filter(file => !excluded.has(file.path))
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
     * Commits the files of a request already claimed (APPLYING) on a new branch, pushes it and opens
     * a pull request. The request ends APPLIED, or back to PROPOSED with the error, which is thrown.
     *
     * The working copy is reset to the latest base first, and every file is checked to still be
     * what the agent saw: a file changed on the remote since would otherwise be silently overwritten.
     * `related` lists the other repositories of the same job, one per line.
     */
    protected async applyClaimed(request: IAiChangeRequest, files: IAiChangeFile[], related: string[] = []): Promise<IAiChangeRequest> {
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
                            description: [
                                request.summary,
                                related.length ? `Part of a change across ${related.length + 1} repositories:\n${related.map(line => `- ${line}`).join("\n")}` : undefined,
                                `---\nRequested in MFE Orchestrator by ${user.email}:\n\n> ${request.prompt.split("\n").join("\n> ")}`
                            ]
                                .filter(Boolean)
                                .join("\n\n")
                        })
                    } catch (error) {
                        // The branch is pushed: the change is not lost, the user opens the pull request by hand.
                        pullRequestError = toErrorMessage(error)
                        fastify.log.warn({ error: loggable(error), aiChangeId: String(request._id) }, "Could not open the pull request")
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
