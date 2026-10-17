import { createBusinessException } from "../../errors/BusinessException"
import { EntityNotFoundError } from "../../errors/EntityNotFoundError"
import AiChangeRequest, { AiChangeStatus, IAiChangeRequest } from "../../models/AiChangeRequestModel"
import { getLlmClient } from "../llm"
import RepositoryWorkspaceService from "../workspace/RepositoryWorkspaceService"
import { findComponent, ownerFields, RepositoryComponent, RepositoryComponentRef } from "../workspace/repositoryComponent"
import AiChangeJobService from "./AiChangeJobService"
import { AiChangeBaseService, ensureNotBeingRefined, staleOutcome } from "./aiChangeShared"

export interface AiChangeCreateInput {
    prompt: string
    baseBranch?: string
}

/**
 * Code changes to a microfrontend or a backend service proposed by an AI agent and applied as a pull request.
 *
 * The agent works on the local working copy of the repository and never pushes: its changes are
 * stored here as a proposal and the copy is reset. Only {@link apply}, a user's explicit action,
 * writes to the remote, and only on a new branch with a pull request.
 */
export class AiChangeService extends AiChangeBaseService {
    private async getComponent(ref: RepositoryComponentRef): Promise<RepositoryComponent> {
        const component = await findComponent(ref)
        if (!component) throw new EntityNotFoundError(ref.id)
        await this.ensureAccessToProject(component.projectId)
        return component
    }

    private async getRequest(id: string): Promise<IAiChangeRequest> {
        const request = await AiChangeRequest.findById(id)
        if (!request) throw new EntityNotFoundError(id)
        await this.ensureAccessToProject(request.projectId)
        return request
    }

    /** A job on the repository of this microfrontend or service alone: the request is the job's only proposal. */
    async create(ref: RepositoryComponentRef, input: AiChangeCreateInput): Promise<IAiChangeRequest> {
        const client = getLlmClient(this.config)
        const component = await this.getComponent(ref)
        await this.ensureCanChangeProject(component.projectId)
        const workspace = await new RepositoryWorkspaceService(this.user).open(component)

        const { requests } = await new AiChangeJobService(this.user, this.config).start(
            {
                projectId: component.projectId,
                prompt: input.prompt,
                scope: "selection",
                repositories: [{ component, baseBranch: input.baseBranch?.trim() || workspace.defaultBranch }]
            },
            client
        )
        return requests[0]
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

    /** The latest requests of a microfrontend or a service, without file contents. */
    async list(ref: RepositoryComponentRef): Promise<IAiChangeRequest[]> {
        const component = await this.getComponent(ref)
        const requests = await AiChangeRequest.find(ownerFields(component), { "files.originalContent": 0, "files.proposedContent": 0, events: 0 }).sort({ createdAt: -1 }).limit(20)
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
     * Commits every file of the proposal on a new branch, pushes it and opens a pull request. The
     * files depend on each other, so a proposal is applied whole. Refused while a follow-up is
     * refining the proposal.
     */
    async apply(id: string): Promise<IAiChangeRequest> {
        const request = await this.getRequest(id)
        await this.ensureCanChangeProject(request.projectId)
        const files = this.filesToCommit(request)
        await ensureNotBeingRefined(request)

        // The status flip is the guard against a double click: only one apply leaves PROPOSED.
        const claimed = await AiChangeRequest.findOneAndUpdate({ _id: request._id, status: AiChangeStatus.PROPOSED }, { status: AiChangeStatus.APPLYING, $unset: { error: 1 } }, { new: true })
        if (!claimed) throw createBusinessException({ code: "AI_CHANGE_NOT_PROPOSED", message: "This change is not waiting for approval", statusCode: 409 })
        return this.applyClaimed(request, files)
    }
}

export default AiChangeService
