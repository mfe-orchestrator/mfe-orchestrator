import { z } from "zod"
import { fastify } from "../.."
import { IAiChangeRequest } from "../../models/AiChangeRequestModel"
import AiChangeService from "../../service/aiChange/AiChangeService"
import { AuthorizedPrincipal } from "../../service/BaseAuthorizedService"
import { MCP_SCOPE_READ, MCP_SCOPE_WRITE } from "../../utils/oauthConfig"
import { DESTRUCTIVE_EXTERNAL, defineTool, objectId, READ_ONLY, WRITE, WRITE_EXTERNAL } from "../toolDefinition"

const microfrontendId = objectId("Id of the microfrontend, from microfrontends_list")
const changeId = objectId("Id of the AI change, from ai_change_start or ai_changes_list")

/** Progress lines kept in a view: the latest ones say where the agent is. */
const RECENT_EVENTS = 10

const service = (principal: AuthorizedPrincipal) => new AiChangeService(principal, fastify.config)

/**
 * A change request as the model sees it: what was asked, where it stands and which files it
 * touches. File contents stay out (the console shows the diff): they can be megabytes, and a tool
 * result is sent again on every later round.
 */
const toChangeView = (request: IAiChangeRequest) => ({
    id: request._id.toString(),
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
    recentEvents: (request.events ?? []).slice(-RECENT_EVENTS).map(event => ({ at: event.at, kind: event.kind, message: event.message })),
    createdAt: request.createdAt,
    updatedAt: request.updatedAt
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
            "Starts an AI agent that proposes a code change on the repository of a microfrontend. It only proposes: nothing is pushed until ai_change_apply. It runs in the background for minutes; follow it with ai_change_get. At most 3 run at once in a project.",
        scope: MCP_SCOPE_WRITE,
        consoleOnly: true,
        // Clones the repository from its provider: nothing is written there yet
        annotations: WRITE_EXTERNAL,
        inputSchema: z.object({
            microfrontendId,
            prompt: z.string().trim().min(1).max(8_000).describe("What to change, written as a request to a developer"),
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
        description: "Commits a PROPOSED change on a new branch of the microfrontend's repository, pushes it and opens a pull request. Files listed in excludePaths are left out.",
        scope: MCP_SCOPE_WRITE,
        consoleOnly: true,
        annotations: DESTRUCTIVE_EXTERNAL,
        inputSchema: z.object({
            changeId,
            excludePaths: z.array(z.string().min(1).max(1_000)).max(100).optional().describe("Paths of proposed files to leave out of the commit")
        }),
        run: async (args, { principal }) => toChangeView(await service(principal).apply(args.changeId, { excludePaths: args.excludePaths }))
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
    })
]
