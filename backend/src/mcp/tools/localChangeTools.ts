import { z } from "zod"
import { createBusinessException } from "../../errors/BusinessException"
import LocalChangeService, { MAX_SUBMITTED_FILES } from "../../service/workspace/LocalChangeService"
import { RepositoryComponentRef } from "../../service/workspace/repositoryComponent"
import { MCP_SCOPE_READ, MCP_SCOPE_WRITE } from "../../utils/oauthConfig"
import { defineTool, objectId, READ_ONLY_EXTERNAL, WRITE_EXTERNAL } from "../toolDefinition"

/** One of the two: a refinement would stop the server from adding `projectId` to the schema. */
const target = {
    microfrontendId: objectId("Id of the microfrontend, from microfrontends_list. Pass this or serviceId").optional(),
    serviceId: objectId("Id of the backend service, from services_list. Pass this or microfrontendId").optional()
}

const refOf = (args: { microfrontendId?: string; serviceId?: string }): RepositoryComponentRef => {
    if (Boolean(args.microfrontendId) === Boolean(args.serviceId)) {
        throw createBusinessException({ code: "LOCAL_CHANGE_TARGET", message: "Pass either microfrontendId or serviceId", statusCode: 400 })
    }
    return args.serviceId ? { kind: "service", id: args.serviceId } : { kind: "microfrontend", id: args.microfrontendId! }
}

/**
 * Code changes made by the client's own agent, on the developer's machine: the server tells where
 * to clone and what the team wrote for agents, then pushes what comes back on a new branch with a
 * pull request. Unlike ai_change_start, no agent runs here, so MCP clients get these.
 */
export const localChangeTools = [
    defineTool({
        name: "repository_checkout_get",
        title: "Get repository checkout",
        description:
            "Where to clone the repository of a microfrontend or a backend service (HTTPS URL without credentials: clone it with your own git access), its default branch, and aiContext: what the team wrote for AI agents about it, its domain and the project. Follow aiContext while editing. When done, send the change with code_change_submit, or push it yourself if you have write access.",
        scope: MCP_SCOPE_READ,
        annotations: READ_ONLY_EXTERNAL,
        inputSchema: z.object(target),
        run: async (args, { principal }) => new LocalChangeService(principal).checkout(refOf(args))
    }),
    defineTool({
        name: "code_change_submit",
        title: "Submit code change",
        description:
            "Pushes files edited in a local clone to a new branch of the repository of a microfrontend or a backend service and opens a pull request against baseBranch; the base branch itself is never written. " +
            "Send the full new content of every created or updated file (text only) and the deleted paths. baseCommit is the commit your clone started from (`git rev-parse HEAD` before your edits, or `git merge-base HEAD origin/<baseBranch>`): " +
            "if baseBranch moved since, the change is refused when one of your files changed there too, or when that commit cannot be checked; pull and submit again. " +
            "CI workflows, lockfiles and registry configuration cannot be changed this way. Returns the branch, the commit and the pull request URL.",
        scope: MCP_SCOPE_WRITE,
        annotations: WRITE_EXTERNAL,
        // A pushed branch runs CI with the repository secrets before anyone merges.
        requiresConfirmation: true,
        inputSchema: z.object({
            ...target,
            baseBranch: z.string().trim().min(1).max(255).optional().describe("Branch the pull request targets, the repository's default branch when omitted"),
            baseCommit: z
                .string()
                .regex(/^[a-f0-9]{40}$/i, "must be a full 40 character commit hash")
                .describe("Commit of baseBranch the local clone started from"),
            title: z.string().trim().min(1).max(200).describe("Commit and pull request title"),
            description: z.string().max(10_000).optional().describe("Pull request description: what changed and why"),
            files: z
                .array(
                    z.object({
                        path: z.string().min(1).max(1000).describe("Path relative to the repository root, with forward slashes"),
                        action: z.enum(["create", "update", "delete"]),
                        content: z.string().optional().describe("Full new content; required for create and update, ignored for delete")
                    })
                )
                .min(1)
                .max(MAX_SUBMITTED_FILES)
        }),
        run: async ({ microfrontendId, serviceId, ...input }, { principal }) => new LocalChangeService(principal).submit(refOf({ microfrontendId, serviceId }), input)
    })
]
