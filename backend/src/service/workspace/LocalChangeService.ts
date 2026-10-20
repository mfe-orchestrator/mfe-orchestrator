import { fastify } from "../.."
import { createBusinessException } from "../../errors/BusinessException"
import { EntityNotFoundError } from "../../errors/EntityNotFoundError"
import { withRepositoryLock } from "../../utils/repositoryLock"
import { isProtectedPath, normalizeRelativePath, WorkspacePathError } from "../../utils/workspacePaths"
import AiChangeService from "../aiChange/AiChangeService"
import { firstLine, loggable, timestamp } from "../aiChange/aiChangeShared"
import BaseAuthorizedService from "../BaseAuthorizedService"
import ProjectService, { ProjectContextDTO } from "../ProjectService"
import { toErrorMessage } from "../RepositoryFileService"
import { FileChangeAction, GitAuthor, ORCHESTRATOR_COMMITTER } from "./GitWorkingCopy"
import RepositoryWorkspaceService, { cloneUrlFor } from "./RepositoryWorkspaceService"
import { findComponent, RepositoryComponent, RepositoryComponentRef } from "./repositoryComponent"

/** Submit waits for a busy working copy only this long, as apply does. */
const LOCK_WAIT_MS = 30_000
export const MAX_SUBMITTED_FILES = 100
/** Every content together: the whole change travels in one MCP request. */
export const MAX_SUBMITTED_BYTES = 768 * 1024

export interface LocalChangeFile {
    path: string
    action: FileChangeAction
    content?: string
}

export interface LocalChangeInput {
    baseBranch?: string
    /** The commit of the base branch the developer's clone started from. */
    baseCommit: string
    title: string
    description?: string
    files: LocalChangeFile[]
}

export interface RepositoryCheckout {
    kind: RepositoryComponent["kind"]
    name: string
    slug: string
    cloneUrl: string
    defaultBranch: string
    aiContext: ProjectContextDTO
}

export interface LocalChangeResult {
    branch: string
    commit: string
    baseBranch: string
    baseCommit: string
    pullRequestUrl?: string
    pullRequestError?: string
}

const invalidFile = (message: string) => createBusinessException({ code: "LOCAL_CHANGE_INVALID_FILE", message, statusCode: 422 })

/**
 * Code changes an agent made on the developer's own machine, through MCP.
 *
 * The developer's agent clones the repository with the developer's own git access and edits it
 * there, guided by the aiContext; nothing runs on the installation's model budget. The change then
 * comes back here whole and is pushed with the connection's token, never handed to the client, on a
 * new branch with a pull request: as for an AI change, the default branch is never written to.
 */
export class LocalChangeService extends BaseAuthorizedService {
    private async getComponent(ref: RepositoryComponentRef): Promise<RepositoryComponent> {
        const component = await findComponent(ref)
        if (!component) throw new EntityNotFoundError(ref.id)
        await this.ensureAccessToDomainMember(component)
        return component
    }

    /** What a developer needs to clone the repository and work on it: the URL carries no credentials. */
    async checkout(ref: RepositoryComponentRef): Promise<RepositoryCheckout> {
        const component = await this.getComponent(ref)
        const workspace = await new RepositoryWorkspaceService(this.user).open(component)
        const focus = component.kind === "service" ? { serviceId: ref.id } : { microfrontendId: ref.id }
        const aiContext = await new ProjectService(this.user).getContext(component.projectId.toString(), focus)
        return {
            kind: component.kind,
            name: component.name,
            slug: component.slug,
            cloneUrl: cloneUrlFor(workspace.target),
            defaultBranch: workspace.defaultBranch,
            aiContext
        }
    }

    /**
     * The files as they will be committed, refused when one leaves the repository, is one CI runs
     * or decides what gets installed, or comes twice.
     */
    private validFiles(files: LocalChangeFile[]): LocalChangeFile[] {
        if (files.length === 0) throw invalidFile("No file to commit")
        if (files.length > MAX_SUBMITTED_FILES) throw invalidFile(`At most ${MAX_SUBMITTED_FILES} files per change`)
        const seen = new Set<string>()
        let bytes = 0
        return files.map(file => {
            let path: string
            try {
                path = normalizeRelativePath(file.path)
            } catch (error) {
                if (error instanceof WorkspacePathError) throw invalidFile(error.message)
                throw error
            }
            if (isProtectedPath(path)) throw invalidFile(`"${path}" cannot be changed from here: CI runs it or it decides what gets installed`)
            if (seen.has(path)) throw invalidFile(`"${path}" is listed twice`)
            seen.add(path)
            if (file.action !== "delete" && file.content === undefined) throw invalidFile(`"${path}" has no content`)
            if (file.content?.includes("\0")) throw invalidFile(`"${path}" is binary: only text files can be submitted`)
            bytes += Buffer.byteLength(file.content ?? "")
            if (bytes > MAX_SUBMITTED_BYTES) throw invalidFile(`The files exceed ${MAX_SUBMITTED_BYTES / 1024} KB together`)
            return { path, action: file.action, content: file.action === "delete" ? undefined : file.content }
        })
    }

    private author(): GitAuthor {
        const user = this.getUser()!
        // An API key has no person behind it: the orchestrator signs, the pull request says which key.
        if (this.user?.apiKeyId) return ORCHESTRATOR_COMMITTER
        return { name: [user.name, user.surname].filter(Boolean).join(" ") || user.email, email: user.email }
    }

    /**
     * Commits the files on a new branch started from the latest `baseBranch`, pushes it and opens a
     * pull request.
     *
     * The base may have moved since the developer cloned: every file is checked to be the same on
     * the latest base as on `baseCommit`, so nobody's work is silently overwritten. When the copy
     * does not hold `baseCommit` (it is fetched shallow) the check cannot be made and the change is
     * refused until the developer pulls.
     */
    async submit(ref: RepositoryComponentRef, input: LocalChangeInput): Promise<LocalChangeResult> {
        const component = await this.getComponent(ref)
        await new AiChangeService(this.user, fastify.config).ensureCanChangeProject(component.projectId)
        const files = this.validFiles(input.files)
        const author = this.author()
        const workspaceService = new RepositoryWorkspaceService(this.user)
        const workspace = await workspaceService.open(component)
        const baseBranch = input.baseBranch?.trim() || workspace.defaultBranch
        const { workingCopy } = workspace

        return withRepositoryLock(
            workingCopy.dir,
            async () => {
                const head = await workspaceService.prepare(workspace, baseBranch)
                const baseCommit = input.baseCommit.toLowerCase()
                if (head !== baseCommit) {
                    if (!(await workingCopy.hasCommit(baseCommit))) {
                        throw createBusinessException({
                            code: "LOCAL_CHANGE_BASE_MOVED",
                            message: `${baseBranch} is now at ${head}, not at ${baseCommit}: pull, keep your changes on top and submit again with the new baseCommit`,
                            details: { head },
                            statusCode: 409
                        })
                    }
                    const conflicts: string[] = []
                    for (const file of files) {
                        if ((await workingCopy.blobOid(baseCommit, file.path)) !== (await workingCopy.blobOid(head, file.path))) conflicts.push(file.path)
                    }
                    if (conflicts.length) {
                        throw createBusinessException({
                            code: "LOCAL_CHANGE_CONFLICT",
                            message: `These files changed on ${baseBranch} after ${baseCommit}: ${conflicts.join(", ")}. Pull, merge and submit again.`,
                            details: { conflicts, head },
                            statusCode: 409
                        })
                    }
                }
                for (const file of files) {
                    const exists = (await workingCopy.blobOid(head, file.path)) !== undefined
                    if (file.action === "create" && exists) throw invalidFile(`"${file.path}" already exists on ${baseBranch}: use update`)
                    if (file.action !== "create" && !exists) throw invalidFile(`"${file.path}" does not exist on ${baseBranch}: use create`)
                }

                const title = firstLine(input.title, 72)
                const branch = `mcp/${component.slug}-${timestamp()}`
                const commit = await workingCopy.commitAndPush({ branch, message: `${title}\n\n${input.description ?? ""}`.trim(), author, files })

                let pullRequestUrl: string | undefined
                let pullRequestError: string | undefined
                try {
                    const submitter = this.user?.apiKeyId ? `the API key ${this.user.apiKeyId}` : this.getUser()!.email
                    pullRequestUrl = await workspaceService.openPullRequest(workspace.target, {
                        sourceBranch: branch,
                        targetBranch: baseBranch,
                        title,
                        description: [input.description?.trim(), `---\nSubmitted through the MFE Orchestrator MCP server by ${submitter}.`].filter(Boolean).join("\n\n")
                    })
                } catch (error) {
                    // The branch is pushed: the change is not lost, the developer opens the pull request by hand.
                    pullRequestError = toErrorMessage(error)
                    fastify.log.warn({ error: loggable(error), component: String(component._id) }, "Could not open the pull request")
                }
                return { branch, commit, baseBranch, baseCommit: head, pullRequestUrl, pullRequestError }
            },
            { waitMs: LOCK_WAIT_MS }
        )
    }
}

export default LocalChangeService
