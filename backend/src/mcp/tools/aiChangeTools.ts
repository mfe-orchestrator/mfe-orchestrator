import { z } from "zod"
import { fastify } from "../.."
import { IAiChangeEvent, IAiChangeRequest } from "../../models/AiChangeRequestModel"
import AiChangeJobService, { AiJobView } from "../../service/aiChange/AiChangeJobService"
import AiChangeService from "../../service/aiChange/AiChangeService"
import { AuthorizedPrincipal } from "../../service/BaseAuthorizedService"
import { LLM_EFFORTS } from "../../service/llm"
import { MCP_SCOPE_READ, MCP_SCOPE_WRITE } from "../../utils/oauthConfig"
import { DESTRUCTIVE_EXTERNAL, defineTool, objectId, READ_ONLY, WRITE, WRITE_EXTERNAL } from "../toolDefinition"

const microfrontendId = objectId("Id of the microfrontend, from microfrontends_list")
const changeId = objectId("Id of the AI change, from ai_change_start or ai_changes_list")
const jobId = objectId("Id of the AI job, from ai_job_start, ai_job_follow_up or the jobId of an AI change")
const prompt = z.string().trim().min(1).max(8_000).describe("What to change, written as a request to a developer")
const effort = z.enum(LLM_EFFORTS).optional().describe("Reasoning effort of the agent. Leave it out unless the user asked for a level: the default fits most changes.")

/** Progress lines kept in a view: the latest ones say where the agent is. */
const RECENT_EVENTS = 10

/**
 * The latest progress lines, without the agent's reasoning: a summary every turn, up to a thousand
 * characters each, would push the steps out of the view and weigh on every later round.
 */
const recentEvents = (events: Pick<IAiChangeEvent, "at" | "kind" | "message">[]) =>
    events
        .filter(event => event.kind !== "thinking")
        .slice(-RECENT_EVENTS)
        .map(event => ({ at: event.at, kind: event.kind, message: event.message }))

const service = (principal: AuthorizedPrincipal) => new AiChangeService(principal, fastify.config)
const jobService = (principal: AuthorizedPrincipal) => new AiChangeJobService(principal, fastify.config)

/**
 * A change request as the model sees it: what was asked, where it stands and which files it
 * touches. File contents stay out (the console shows the diff): they can be megabytes, and a tool
 * result is sent again on every later round.
 */
const toChangeView = (request: Omit<IAiChangeRequest, "events"> & Partial<Pick<IAiChangeRequest, "events">>) => ({
    id: request._id.toString(),
    jobId: request.jobId ? String(request.jobId) : undefined,
    conversationId: String(request.conversationId),
    // A change reached by its id (ai_change_get) may be a backend service's.
    ...(request.serviceId ? { serviceId: String(request.serviceId) } : { microfrontendId: String(request.microfrontendId) }),
    status: request.status,
    prompt: request.prompt,
    effort: request.effort,
    baseBranch: request.baseBranch,
    summary: request.summary,
    files: (request.files ?? []).map(file => ({ path: file.path, action: file.action })),
    branch: request.branch,
    commit: request.commit,
    pushError: request.pushError,
    pullRequestUrl: request.pullRequestUrl,
    pullRequestError: request.pullRequestError,
    error: request.error,
    // The job's usage: shared by every repository of the job.
    usage: request.usage,
    // Lists read the changes without their progress: an empty list would say nothing happened
    ...(request.events ? { recentEvents: recentEvents(request.events) } : {}),
    createdAt: request.createdAt,
    updatedAt: request.updatedAt
})

/** A job as the model sees it: one line per repository, the latest progress lines, what it cost. */
const toJobView = (job: AiJobView) => ({
    jobId: job._id,
    rootJobId: job.rootJobId,
    parentJobId: job.parentJobId,
    status: job.status,
    prompt: job.prompt,
    scope: job.scope,
    domainId: job.domainId,
    effort: job.effort,
    summary: job.summary,
    error: job.error,
    usage: job.usage,
    // A global job also takes the services of the project: their id is not one microfrontend_get knows
    repositories: job.repositories.map(repository => ({
        changeId: repository.requestId,
        kind: repository.kind,
        ...(repository.kind === "service"
            ? { serviceId: repository.microfrontendId, service: repository.microfrontendName }
            : { microfrontendId: repository.microfrontendId, microfrontend: repository.microfrontendName }),
        status: repository.status,
        files: repository.files,
        error: repository.error,
        baseBranch: repository.baseBranch,
        branch: repository.branch,
        commit: repository.commit,
        pushError: repository.pushError,
        pullRequestUrl: repository.pullRequestUrl,
        pullRequestError: repository.pullRequestError
    })),
    recentEvents: recentEvents(job.events ?? []),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
})

/**
 * Console-only tools for the AI code changes of a microfrontend: an agent proposes a change on its
 * repository and pushes it on a feature branch, the user applies it onto the base branch, opens a
 * pull request from it or discards it. Starting one runs a paid agent
 * for minutes, which is why MCP clients do not get these.
 */
export const aiChangeTools = [
    defineTool({
        name: "ai_change_start",
        title: "Start AI code change",
        description:
            "Starts an AI agent that proposes a code change on the repository of a microfrontend. It only proposes: the proposal is pushed on a feature branch of its own (branch), never on the base, until ai_change_apply. It runs in the background for minutes; follow it with ai_change_get. It runs as an AI job on this repository alone: its jobId works with ai_job_get and ai_job_follow_up. At most 3 jobs run at once in a project.",
        scope: MCP_SCOPE_WRITE,
        consoleOnly: true,
        // Clones the repository from its provider and, once done, pushes the proposal on a feature branch: never on the base
        annotations: WRITE_EXTERNAL,
        inputSchema: z.object({
            microfrontendId,
            prompt,
            baseBranch: z.string().trim().min(1).max(255).optional().describe("Branch to start from, the repository's default branch when omitted"),
            effort
        }),
        run: async (args, { principal }) =>
            toChangeView(await service(principal).create({ kind: "microfrontend", id: args.microfrontendId }, { prompt: args.prompt, baseBranch: args.baseBranch, effort: args.effort }))
    }),
    defineTool({
        name: "ai_changes_list",
        title: "List AI code changes",
        description: "The latest AI code changes of a microfrontend (up to 20), newest first, with their status and the files they touch.",
        scope: MCP_SCOPE_READ,
        consoleOnly: true,
        annotations: READ_ONLY,
        inputSchema: z.object({ microfrontendId }),
        run: async (args, { principal }) => (await service(principal).list({ kind: "microfrontend", id: args.microfrontendId })).map(toChangeView)
    }),
    defineTool({
        name: "ai_change_get",
        title: "Get AI code change",
        description:
            "Status of one AI code change (PENDING, RUNNING, PROPOSED, APPLYING, APPLIED, DISCARDED, FAILED), its summary, the files it proposes to create, update or delete, its latest progress lines, the feature branch it is pushed on and its pull request once opened. The diff itself is shown in the console.",
        scope: MCP_SCOPE_READ,
        consoleOnly: true,
        annotations: READ_ONLY,
        inputSchema: z.object({ changeId }),
        run: async (args, { principal }) => toChangeView(await service(principal).get(args.changeId))
    }),
    defineTool({
        name: "ai_change_apply",
        title: "Apply AI code change",
        description:
            "Pushes a PROPOSED change straight onto the base branch of the microfrontend's repository, without a review: to have it reviewed first, use ai_change_open_pull_request. Every proposed file is applied: they depend on each other, so a proposal cannot be applied in part. A protected base branch refuses it with AI_CHANGE_PUSH_REFUSED.",
        scope: MCP_SCOPE_WRITE,
        consoleOnly: true,
        annotations: DESTRUCTIVE_EXTERNAL,
        inputSchema: z.object({ changeId }),
        run: async (args, { principal }) => toChangeView(await service(principal).apply(args.changeId))
    }),
    defineTool({
        name: "ai_change_open_pull_request",
        title: "Open a pull request for an AI code change",
        description:
            "Opens a pull request (a merge request on GitLab) from the feature branch of a PROPOSED change onto its base branch, for a review in the repository. The change stays PROPOSED: a follow-up updates the pull request, ai_change_apply still applies it. pullRequestError tells why the provider refused it.",
        scope: MCP_SCOPE_WRITE,
        consoleOnly: true,
        // Others see it on the repository: the assistant asks the user first.
        requiresConfirmation: true,
        annotations: WRITE_EXTERNAL,
        inputSchema: z.object({ changeId }),
        run: async (args, { principal }) => toChangeView(await service(principal).openPullRequest(args.changeId))
    }),
    defineTool({
        name: "ai_change_discard",
        title: "Discard AI code change",
        description: "Discards a PROPOSED change: nothing is written to the repository.",
        scope: MCP_SCOPE_WRITE,
        consoleOnly: true,
        // A discarded proposal cannot be brought back: the assistant asks the user first.
        requiresConfirmation: true,
        annotations: WRITE,
        inputSchema: z.object({ changeId }),
        run: async (args, { principal }) => toChangeView(await service(principal).discard(args.changeId))
    }),
    defineTool({
        name: "ai_job_start",
        title: "Start AI job",
        description:
            "Starts one AI agent that proposes a coherent code change across several repositories at once, e.g. an API changed in one and its callers updated in the others. With domainId it works on the microfrontends and services of that functional domain, frontend and backend together, and is told what the domain is for. Without domainId nor microfrontendIds it works on every microfrontend and service of the project with a repository (at most 10). Each repository gets its own proposal, pushed on a feature branch of its own; nothing reaches a base branch until ai_job_apply. It runs in the background for minutes; follow it with ai_job_get. At most 3 jobs run at once in a project.",
        scope: MCP_SCOPE_WRITE,
        consoleOnly: true,
        // Clones the repositories from their provider: nothing is written there yet
        annotations: WRITE_EXTERNAL,
        inputSchema: z
            .object({
                prompt,
                domainId: objectId("Id of a functional domain, from domains_list: the job works on its microfrontends and services").optional(),
                microfrontendIds: z
                    .array(objectId("Id of a microfrontend, from microfrontends_list"))
                    .min(1)
                    .max(10)
                    .optional()
                    .describe("The microfrontends to change, without domainId; all the microfrontends and services with a repository when both are omitted"),
                effort
            })
            .refine(args => !(args.domainId && args.microfrontendIds), { message: "Pass domainId or microfrontendIds, not both" }),
        run: async (args, { principal, projectId }) =>
            toJobView(
                await jobService(principal).create(
                    projectId,
                    args.domainId
                        ? { prompt: args.prompt, scope: "domain", domainId: args.domainId, effort: args.effort }
                        : args.microfrontendIds
                          ? { prompt: args.prompt, scope: "selection", microfrontendIds: args.microfrontendIds, effort: args.effort }
                          : { prompt: args.prompt, scope: "global", effort: args.effort }
                )
            )
    }),
    defineTool({
        name: "ai_job_follow_up",
        title: "Follow up an AI job",
        description:
            "Refines the proposals of a finished AI job (status DONE) with a new request: a new job starts from what the previous one proposed instead of from scratch, and replaces its proposals once done. microfrontendIds narrows it to some repositories of the job.",
        scope: MCP_SCOPE_WRITE,
        consoleOnly: true,
        annotations: WRITE_EXTERNAL,
        inputSchema: z.object({
            jobId,
            prompt,
            microfrontendIds: z
                .array(objectId("Id of a repository of the job: its microfrontendId or serviceId in ai_job_get"))
                .min(1)
                .max(10)
                .optional()
                .describe("The repositories of the job to refine; all those still proposed when omitted"),
            effort
        }),
        run: async (args, { principal }) => toJobView(await jobService(principal).followUp(args.jobId, { prompt: args.prompt, microfrontendIds: args.microfrontendIds, effort: args.effort }))
    }),
    defineTool({
        name: "ai_job_get",
        title: "Get AI job",
        description:
            "Status of an AI job (PENDING, RUNNING, DONE, FAILED), its summary, the tokens it used, its latest progress lines and, per repository (a microfrontend's or a service's, see kind), the status of its proposal (a changeId for ai_change_get), the files it touches, its feature branch and its pull request once opened.",
        scope: MCP_SCOPE_READ,
        consoleOnly: true,
        annotations: READ_ONLY,
        inputSchema: z.object({ jobId }),
        run: async (args, { principal }) => toJobView(await jobService(principal).get(args.jobId))
    }),
    defineTool({
        name: "ai_job_apply",
        title: "Apply AI job",
        description:
            "Pushes every PROPOSED change of a finished AI job straight onto the base branch of its repository, without a review. It answers at once with the proposals APPLYING and pushes them in the background; follow it with ai_job_get. A repository that cannot be applied goes back to PROPOSED with its error and does not stop the others.",
        scope: MCP_SCOPE_WRITE,
        consoleOnly: true,
        requiresConfirmation: true,
        annotations: DESTRUCTIVE_EXTERNAL,
        inputSchema: z.object({ jobId }),
        run: async (args, { principal }) => toJobView(await jobService(principal).apply(args.jobId))
    })
]
