import { fastify } from "../.."
import { createBusinessException } from "../../errors/BusinessException"
import { EntityNotFoundError } from "../../errors/EntityNotFoundError"
import AiChangeRequest, { AiChangeStatus, IAiChangeRequest } from "../../models/AiChangeRequestModel"
import { LlmEffort } from "../llm"
import RepositoryWorkspaceService from "../workspace/RepositoryWorkspaceService"
import { componentIdOf, componentOf, findComponent, findComponents, ownerFields, RepositoryComponent, RepositoryComponentRef } from "../workspace/repositoryComponent"
import AiChangeJobService from "./AiChangeJobService"
import { AiChangeBaseService, ensureNotBeingRefined, loggable, staleOutcome } from "./aiChangeShared"

const LISTED_CONVERSATIONS = 20

export interface AiChangeCreateInput {
    prompt: string
    baseBranch?: string
    /** How hard the agent reasons: the job's default when left out. */
    effort?: LlmEffort
    /** The AI the agent runs on, one the project may use: the project's default when left out. */
    aiModelId?: string
}

/**
 * Code changes to a microfrontend or a backend service proposed by an AI agent.
 *
 * The agent works on the local working copy of the repository and never pushes. Once it is done, its
 * changes are stored here as a proposal and pushed on a feature branch of their own, never on the
 * base. Only {@link apply}, a user's explicit action, brings them onto the base branch;
 * {@link openPullRequest} asks for a review of the feature branch instead.
 */
export class AiChangeService extends AiChangeBaseService {
    private async getComponent(ref: RepositoryComponentRef): Promise<RepositoryComponent> {
        const component = await findComponent(ref)
        if (!component) throw new EntityNotFoundError(ref.id)
        await this.ensureAccessToDomainMember(component)
        return component
    }

    private async getRequest(id: string): Promise<IAiChangeRequest> {
        const request = await AiChangeRequest.findById(id)
        if (!request) throw new EntityNotFoundError(id)
        await this.ensureAccessToProject(request.projectId)
        // A domain-scoped member reaches the changes of the microfrontends and services they see only;
        // one whose component is gone belongs to no domain any more
        if (await this.getDomainScope(request.projectId)) {
            const component = await findComponent(componentOf(request))
            await this.ensureInDomainScope(request.projectId, component?.domainId)
        }
        return request
    }

    /** A job on the repository of this microfrontend or service alone: the request is the job's only proposal. */
    async create(ref: RepositoryComponentRef, input: AiChangeCreateInput): Promise<IAiChangeRequest> {
        const component = await this.getComponent(ref)
        await this.ensureCanChangeProject(component.projectId)
        const aiModel = await this.aiModels().resolveForProject(component.projectId, input.aiModelId)
        await this.ensureRepositoryInDomainScope(component, component.codeRepository)
        const workspace = await new RepositoryWorkspaceService(this.user).open(component)

        const { requests } = await new AiChangeJobService(this.user, this.config).start(
            {
                projectId: component.projectId,
                prompt: input.prompt,
                scope: "selection",
                repositories: [{ component, baseBranch: input.baseBranch?.trim() || workspace.defaultBranch }],
                effort: input.effort
            },
            aiModel
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

    /**
     * The latest conversations on a microfrontend or a service, each with every request of it on this repository,
     * newest first, without file contents. Whole conversations: a queue cut in the middle of one would show it twice.
     */
    async list(ref: RepositoryComponentRef): Promise<Omit<IAiChangeRequest, "events">[]> {
        const component = await this.getComponent(ref)
        const owner = ownerFields(component)
        const conversations = await AiChangeRequest.aggregate<{ _id: IAiChangeRequest["conversationId"] }>([
            { $match: owner },
            { $group: { _id: "$conversationId", latestAt: { $max: "$createdAt" } } },
            { $sort: { latestAt: -1 } },
            { $limit: LISTED_CONVERSATIONS }
        ])
        const requests = await AiChangeRequest.find(
            { ...owner, conversationId: { $in: conversations.map(conversation => conversation._id) } },
            { "files.originalContent": 0, "files.proposedContent": 0, events: 0 }
        ).sort({ createdAt: -1 })
        for (const request of requests) {
            const outcome = staleOutcome(request)
            if (outcome) request.status = outcome
        }
        return requests
    }

    async discard(id: string): Promise<IAiChangeRequest> {
        const request = await this.getRequest(id)
        await this.ensureCanChangeProject(request.projectId)
        // A follow-up running on it pushes the same branch: deleting it now would take the follow-up's work away.
        await ensureNotBeingRefined(request)
        const discarded = await AiChangeRequest.findOneAndUpdate({ _id: request._id, status: AiChangeStatus.PROPOSED }, { status: AiChangeStatus.DISCARDED }, { new: true })
        if (!discarded) throw createBusinessException({ code: "AI_CHANGE_NOT_PROPOSED", message: "Only a proposal can be discarded", statusCode: 409 })
        // Detached: the remote may take seconds to answer, and nothing waits for the branch to go.
        this.dropBranch(discarded).catch(error => fastify.log.warn({ error: loggable(error), aiChangeId: id }, "Could not delete the branch of a discarded change"))
        return discarded
    }

    /**
     * Opens a pull request from the feature branch of the proposal onto its base. The proposal stays
     * open: it can still be refined, applied or discarded. Refused while a follow-up is refining it.
     */
    async openPullRequest(id: string): Promise<IAiChangeRequest> {
        const request = await this.getRequest(id)
        await this.ensureCanChangeProject(request.projectId)
        await this.ensureRepositoriesInDomainScope(request.projectId, [componentOf(request)])
        if (request.status !== AiChangeStatus.PROPOSED) throw createBusinessException({ code: "AI_CHANGE_NOT_PROPOSED", message: "This change is not waiting for approval", statusCode: 409 })
        if (request.pullRequestUrl) return request
        const files = this.filesToCommit(request)
        await ensureNotBeingRefined(request)

        // Each description names the other repositories of the job, with their pull requests once opened.
        const siblings = request.jobId ? await AiChangeRequest.find({ jobId: request.jobId, _id: { $ne: request._id } }, { microfrontendId: 1, serviceId: 1, pullRequestUrl: 1 }) : []
        const components = await findComponents(siblings.map(componentOf), { name: 1 })
        const related = siblings.map(sibling =>
            [components.find(component => String(component._id) === componentIdOf(sibling))?.name ?? componentIdOf(sibling), sibling.pullRequestUrl].filter(Boolean).join(": ")
        )
        return this.openPullRequestFor(request, files, related)
    }

    /**
     * Brings every file of the proposal onto its base branch. The files depend on each other, so a
     * proposal is applied whole. Refused while a follow-up is refining the proposal.
     */
    async apply(id: string): Promise<IAiChangeRequest> {
        const request = await this.getRequest(id)
        await this.ensureCanChangeProject(request.projectId)
        await this.ensureRepositoriesInDomainScope(request.projectId, [componentOf(request)])
        const files = this.filesToCommit(request)
        await ensureNotBeingRefined(request)

        // The status flip is the guard against a double click: only one apply leaves PROPOSED.
        const claimed = await AiChangeRequest.findOneAndUpdate({ _id: request._id, status: AiChangeStatus.PROPOSED }, { status: AiChangeStatus.APPLYING, $unset: { error: 1 } }, { new: true })
        if (!claimed) throw createBusinessException({ code: "AI_CHANGE_NOT_PROPOSED", message: "This change is not waiting for approval", statusCode: 409 })
        return this.applyClaimed(request, files)
    }
}

export default AiChangeService
