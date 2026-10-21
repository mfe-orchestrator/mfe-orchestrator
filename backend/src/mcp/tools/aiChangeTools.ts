import { z } from "zod"
import { fastify } from "../.."
import { IAiChangeEvent, IAiChangeRequest } from "../../models/AiChangeRequestModel"
import AiModelService from "../../service/AiModelService"
import AiChangeJobService, { AiJobView } from "../../service/aiChange/AiChangeJobService"
import AiChangeService from "../../service/aiChange/AiChangeService"
import DomainPlanService from "../../service/aiChange/DomainPlanService"
import { AuthorizedPrincipal } from "../../service/BaseAuthorizedService"
import { LLM_EFFORTS } from "../../service/llm"
import { MCP_SCOPE_READ, MCP_SCOPE_WRITE } from "../../utils/oauthConfig"
import { DESTRUCTIVE_EXTERNAL, defineTool, NO_INPUT, objectId, READ_ONLY, WRITE, WRITE_EXTERNAL } from "../toolDefinition"

const microfrontendId = objectId("Id of the microfrontend, from microfrontends_list")
const serviceId = objectId("Id of the backend service, from services_list")

/** The repository a change works on: the one of a microfrontend or the one of a service, never both. */
const componentFields = { microfrontendId: microfrontendId.optional(), serviceId: serviceId.optional() }
const oneComponent = (args: { microfrontendId?: string; serviceId?: string }) => Boolean(args.microfrontendId) !== Boolean(args.serviceId)
const ONE_COMPONENT = { message: "Pass microfrontendId or serviceId, exactly one" }
const componentOf = (args: { microfrontendId?: string; serviceId?: string }) =>
    args.serviceId ? { kind: "service" as const, id: args.serviceId } : { kind: "microfrontend" as const, id: args.microfrontendId! }
const changeId = objectId("Id of the AI change, from ai_change_start or ai_changes_list")
const jobId = objectId("Id of the AI job, from ai_job_start, ai_job_follow_up or the jobId of an AI change")
const prompt = z.string().trim().min(1).max(8_000).describe("What to change, written as a request to a developer")
const effort = z.enum(LLM_EFFORTS).optional().describe("Reasoning effort of the agent. Leave it out unless the user asked for a level: the default fits most changes.")
const aiModelId = z
    .string()
    .trim()
    .min(1)
    .max(64)
    .optional()
    .describe("Id of the AI the agent runs on, from ai_models_list. Leave it out unless the user named an AI: the project's default is used, the parent's for a follow-up.")

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
const aiModelService = (principal: AuthorizedPrincipal) => new AiModelService(principal, fastify.config)

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
    aiModelId: request.aiModelId,
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
    aiModelId: job.aiModelId,
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
    // A listed job is read without its progress: the view has none rather than an empty one
    ...(job.events ? { recentEvents: recentEvents(job.events) } : {}),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
})

/**
 * Console-only tools for the AI code changes of a microfrontend or a service: an agent proposes a change on its
 * repository and pushes it on a feature branch, the user applies it onto the base branch, opens a
 * pull request from it or discards it. Starting one runs a paid agent
 * for minutes, which is why MCP clients do not get these.
 */
export const aiChangeTools = [
    defineTool({
        name: "ai_models_list",
        title: "List AI models",
        description:
            "The AIs the project may run its agents on (id, name, provider, model, the effort levels each takes) and defaultId, the one used when aiModelId is left out. Pass an id as aiModelId to ai_change_start, ai_job_start or ai_job_follow_up only when the user asked for a specific AI.",
        scope: MCP_SCOPE_READ,
        consoleOnly: true,
        annotations: READ_ONLY,
        inputSchema: NO_INPUT,
        run: async (_args, { principal, projectId }) => aiModelService(principal).availableForProject(projectId)
    }),
    defineTool({
        name: "ai_change_start",
        title: "Start AI code change",
        description:
            "Starts an AI agent that proposes a code change on the repository of a microfrontend or of a backend service: pass exactly one of microfrontendId and serviceId. It only proposes: the proposal is pushed on a feature branch of its own (branch), never on the base, until ai_change_apply. It runs in the background for minutes; follow it with ai_change_get. It runs as an AI job on this repository alone: its jobId works with ai_job_get and ai_job_follow_up. At most 3 jobs run at once in a project.",
        scope: MCP_SCOPE_WRITE,
        consoleOnly: true,
        // Clones the repository from its provider and, once done, pushes the proposal on a feature branch: never on the base
        annotations: WRITE_EXTERNAL,
        inputSchema: z
            .object({
                ...componentFields,
                prompt,
                baseBranch: z.string().trim().min(1).max(255).optional().describe("Branch to start from, the repository's default branch when omitted"),
                effort,
                aiModelId
            })
            .refine(oneComponent, ONE_COMPONENT),
        run: async (args, { principal }) =>
            toChangeView(await service(principal).create(componentOf(args), { prompt: args.prompt, baseBranch: args.baseBranch, effort: args.effort, aiModelId: args.aiModelId }))
    }),
    defineTool({
        name: "ai_changes_list",
        title: "List AI code changes",
        description:
            "The latest AI code changes of a microfrontend or of a backend service (up to 20), newest first, with their status and the files they touch. Pass exactly one of microfrontendId and serviceId.",
        scope: MCP_SCOPE_READ,
        consoleOnly: true,
        annotations: READ_ONLY,
        inputSchema: z.object(componentFields).refine(oneComponent, ONE_COMPONENT),
        run: async (args, { principal }) => (await service(principal).list(componentOf(args))).map(toChangeView)
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
            "Starts one AI agent that proposes a coherent code change across several repositories at once, e.g. an API changed in one and its callers updated in the others. With domainId it works on the microfrontends and services of that functional domain, frontend and backend together, and is told what the domain is for. With microfrontendIds and/or serviceIds it works on those. With none of them it works on every microfrontend and service of the project with a repository (at most 10). baseBranches picks the branch each repository starts from. Each repository gets its own proposal, pushed on a feature branch of its own; nothing reaches a base branch until ai_job_apply. It runs in the background for minutes; follow it with ai_job_get. At most 3 jobs run at once in a project.",
        scope: MCP_SCOPE_WRITE,
        consoleOnly: true,
        // Clones the repositories from their provider: nothing is written there yet
        annotations: WRITE_EXTERNAL,
        inputSchema: z
            .object({
                prompt,
                domainId: objectId("Id of a functional domain, from domains_list: the job works on its microfrontends and services").optional(),
                microfrontendIds: z.array(objectId("Id of a microfrontend, from microfrontends_list")).min(1).max(10).optional().describe("The microfrontends to change, without domainId"),
                serviceIds: z.array(objectId("Id of a backend service, from services_list")).min(1).max(10).optional().describe("The backend services to change, without domainId"),
                baseBranches: z
                    .record(z.string().regex(/^[a-fA-F0-9]{24}$/), z.string().trim().min(1).max(255))
                    .refine(branches => Object.keys(branches).length <= 100, { message: "At most 100 base branches" })
                    .optional()
                    .describe("The branch each repository starts from, by microfrontend or service id; its default branch when left out"),
                effort,
                aiModelId
            })
            .refine(args => !(args.domainId && (args.microfrontendIds || args.serviceIds)), { message: "Pass domainId or microfrontendIds/serviceIds, not both" }),
        run: async (args, { principal, projectId }) =>
            toJobView(
                await jobService(principal).create(projectId, {
                    prompt: args.prompt,
                    effort: args.effort,
                    aiModelId: args.aiModelId,
                    baseBranches: args.baseBranches,
                    ...(args.domainId
                        ? { scope: "domain", domainId: args.domainId }
                        : args.microfrontendIds || args.serviceIds
                          ? { scope: "selection", microfrontendIds: args.microfrontendIds, serviceIds: args.serviceIds }
                          : { scope: "global" })
                })
            )
    }),
    defineTool({
        name: "ai_domain_plan",
        title: "Plan a new domain",
        description:
            "Asks the AI which microfrontends and services a functional domain that has none yet needs for a request: for each a name, a slug, a repository name, the marketplace template to scaffold it from and why. It only proposes and answers in seconds: create them with microfrontend_scaffold and service_scaffold, then start an ai_job_start on the domain to implement the request.",
        scope: MCP_SCOPE_WRITE,
        consoleOnly: true,
        // Nothing is written, but it is a paid model call: under mfe:write like every AI tool
        annotations: WRITE_EXTERNAL,
        inputSchema: z.object({ domainId: objectId("Id of the functional domain to plan, from domains_list"), prompt, aiModelId }),
        run: (args, { principal, projectId }) => new DomainPlanService(principal, fastify.config).plan(projectId, args)
    }),
    defineTool({
        name: "ai_jobs_list",
        title: "List AI jobs",
        description:
            "The latest AI jobs you started in the project, newest first, without their progress lines (ai_job_get has them). With active, only those still running or with proposals not yet applied nor discarded.",
        scope: MCP_SCOPE_READ,
        consoleOnly: true,
        annotations: READ_ONLY,
        inputSchema: z.object({ active: z.boolean().optional() }),
        run: async (args, { principal, projectId }) => (await jobService(principal).list(projectId, args.active)).map(toJobView)
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
            effort,
            aiModelId
        }),
        run: async (args, { principal }) =>
            toJobView(await jobService(principal).followUp(args.jobId, { prompt: args.prompt, microfrontendIds: args.microfrontendIds, effort: args.effort, aiModelId: args.aiModelId }))
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
