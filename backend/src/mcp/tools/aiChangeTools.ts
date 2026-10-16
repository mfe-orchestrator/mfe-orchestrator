import { z } from "zod"
import { fastify } from "../.."
import { IAiChangeRequest } from "../../models/AiChangeRequestModel"
import AiChangeJobService, { AiJobView } from "../../service/aiChange/AiChangeJobService"
import AiChangeService from "../../service/aiChange/AiChangeService"
import { AuthorizedPrincipal } from "../../service/BaseAuthorizedService"
import { MCP_SCOPE_READ, MCP_SCOPE_WRITE } from "../../utils/oauthConfig"
import { DESTRUCTIVE_EXTERNAL, defineTool, objectId, READ_ONLY, WRITE, WRITE_EXTERNAL } from "../toolDefinition"

const microfrontendId = objectId("Id of the microfrontend, from microfrontends_list")
const changeId = objectId("Id of the AI change, from ai_change_start or ai_changes_list")
const jobId = objectId("Id of the AI job, from ai_job_start, ai_job_follow_up or the jobId of an AI change")
const prompt = z.string().trim().min(1).max(8_000).describe("What to change, written as a request to a developer")

/** Progress lines kept in a view: the latest ones say where the agent is. */
const RECENT_EVENTS = 10

const service = (principal: AuthorizedPrincipal) => new AiChangeService(principal, fastify.config)
const jobService = (principal: AuthorizedPrincipal) => new AiChangeJobService(principal, fastify.config)

/**
 * A change request as the model sees it: what was asked, where it stands and which files it
 * touches. File contents stay out (the console shows the diff): they can be megabytes, and a tool
 * result is sent again on every later round.
 */
const toChangeView = (request: IAiChangeRequest) => ({
    id: request._id.toString(),
    jobId: request.jobId ? String(request.jobId) : undefined,
    microfrontendId: String(request.microfrontendId),
    status: request.status,
    prompt: request.prompt,
    baseBranch: request.baseBranch,
    summary: request.summary,
    files: (request.files ?? []).map(file => ({ path: file.path, action: file.action })),
    branch: request.branch,
    pullRequestUrl: request.pullRequestUrl,
    pullRequestError: request.pullRequestError,
    error: request.error,
    // The job's usage: shared by every repository of the job.
    usage: request.usage,
    recentEvents: (request.events ?? []).slice(-RECENT_EVENTS).map(event => ({ at: event.at, kind: event.kind, message: event.message })),
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
    summary: job.summary,
    error: job.error,
    usage: job.usage,
    repositories: job.repositories.map(repository => ({
        changeId: repository.requestId,
        microfrontendId: repository.microfrontendId,
        microfrontend: repository.microfrontendName,
        status: repository.status,
        files: repository.files,
        error: repository.error,
        branch: repository.branch,
        pullRequestUrl: repository.pullRequestUrl,
        pullRequestError: repository.pullRequestError
    })),
    recentEvents: (job.events ?? []).slice(-RECENT_EVENTS),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
})

/**
 * Console-only tools for the AI code changes of a microfrontend: an agent proposes a change on its
 * repository, the user applies it as a pull request or discards it. Starting one runs a paid agent
 * for minutes, which is why MCP clients do not get these.
 */
export const aiChangeTools = [
    defineTool({
        name: "ai_change_start",
        title: "Start AI code change",
        description:
            "Starts an AI agent that proposes a code change on the repository of a microfrontend. It only proposes: nothing is pushed until ai_change_apply. It runs in the background for minutes; follow it with ai_change_get. It runs as an AI job on this repository alone: its jobId works with ai_job_get and ai_job_follow_up. At most 3 jobs run at once in a project.",
        scope: MCP_SCOPE_WRITE,
        consoleOnly: true,
        // Clones the repository from its provider: nothing is written there yet
        annotations: WRITE_EXTERNAL,
        inputSchema: z.object({
            microfrontendId,
            prompt,
            baseBranch: z.string().trim().min(1).max(255).optional().describe("Branch to start from, the repository's default branch when omitted")
        }),
        run: async (args, { principal }) => toChangeView(await service(principal).create(args.microfrontendId, { prompt: args.prompt, baseBranch: args.baseBranch }))
    }),
    defineTool({
        name: "ai_changes_list",
        title: "List AI code changes",
        description: "The latest AI code changes of a microfrontend (up to 20), newest first, with their status and the files they touch.",
        scope: MCP_SCOPE_READ,
        consoleOnly: true,
        annotations: READ_ONLY,
        inputSchema: z.object({ microfrontendId }),
        run: async (args, { principal }) => (await service(principal).list(args.microfrontendId)).map(toChangeView)
    }),
    defineTool({
        name: "ai_change_get",
        title: "Get AI code change",
        description:
            "Status of one AI code change (PENDING, RUNNING, PROPOSED, APPLYING, APPLIED, DISCARDED, FAILED), its summary, the files it proposes to create, update or delete, its latest progress lines and, once applied, the pull request. The diff itself is shown in the console.",
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
            "Commits a PROPOSED change on a new branch of the microfrontend's repository, pushes it and opens a pull request. Every proposed file is committed: they depend on each other, so a proposal cannot be applied in part.",
        scope: MCP_SCOPE_WRITE,
        consoleOnly: true,
        annotations: DESTRUCTIVE_EXTERNAL,
        inputSchema: z.object({ changeId }),
        run: async (args, { principal }) => toChangeView(await service(principal).apply(args.changeId))
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
            "Starts one AI agent that proposes a coherent code change across the repositories of several microfrontends at once, e.g. an API changed in one and its callers updated in the others. Without microfrontendIds it works on every microfrontend of the project with a repository (at most 10). Each repository gets its own proposal, applied as its own pull request; nothing is pushed until ai_job_apply. It runs in the background for minutes; follow it with ai_job_get. At most 3 jobs run at once in a project.",
        scope: MCP_SCOPE_WRITE,
        consoleOnly: true,
        // Clones the repositories from their provider: nothing is written there yet
        annotations: WRITE_EXTERNAL,
        inputSchema: z.object({
            prompt,
            microfrontendIds: z
                .array(objectId("Id of a microfrontend, from microfrontends_list"))
                .min(1)
                .max(10)
                .optional()
                .describe("The microfrontends to change; all those with a repository when omitted")
        }),
        run: async (args, { principal, projectId }) =>
            toJobView(
                await jobService(principal).create(
                    projectId,
                    args.microfrontendIds ? { prompt: args.prompt, scope: "selection", microfrontendIds: args.microfrontendIds } : { prompt: args.prompt, scope: "global" }
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
            microfrontendIds: z.array(objectId("Id of a microfrontend of the job")).min(1).max(10).optional().describe("The repositories of the job to refine; all those still proposed when omitted")
        }),
        run: async (args, { principal }) => toJobView(await jobService(principal).followUp(args.jobId, { prompt: args.prompt, microfrontendIds: args.microfrontendIds }))
    }),
    defineTool({
        name: "ai_job_get",
        title: "Get AI job",
        description:
            "Status of an AI job (PENDING, RUNNING, DONE, FAILED), its summary, the tokens it used, its latest progress lines and, per repository, the status of its proposal (a changeId for ai_change_get), the files it touches and, once applied, the pull request.",
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
            "Applies every PROPOSED change of a finished AI job: one branch and one pull request per repository, each description naming the others. It answers at once with the proposals APPLYING and opens the pull requests in the background; follow it with ai_job_get. A repository that cannot be applied goes back to PROPOSED with its error and does not stop the others.",
        scope: MCP_SCOPE_WRITE,
        consoleOnly: true,
        requiresConfirmation: true,
        annotations: DESTRUCTIVE_EXTERNAL,
        inputSchema: z.object({ jobId }),
        run: async (args, { principal }) => toJobView(await jobService(principal).apply(args.jobId))
    })
]
