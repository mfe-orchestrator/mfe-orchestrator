/**
 * The console assistant's hands: runs the MCP tools in process, for the signed-in user, on the
 * project of the request.
 *
 * Stream protocol of `POST /assistant/chat` (Server-Sent Events, one JSON object per frame):
 * - `text` `{ delta }`: a piece of the answer as the model writes it.
 * - `tool_call` `{ id, name, title, input, kind }`: the model asked for a tool. `kind` is `read`,
 *   `write` (runs directly), `confirm` (waits for the user, not destructive: it grants access or
 *   cannot be undone) or `destructive` (waits for the user); `input` is what the model sent.
 * - `tool_result` `{ id, ok, summary, result? }`: how the call with that `id` ended. `summary` is a
 *   short line (the error when `ok` is false); `result` is only there when `ok` is true and is the
 *   tool's result as the user may see it (`forUser` of `presentResult`), or a string cut at 20 000
 *   characters when the JSON of it is longer. A call that needs a confirmation gets no `tool_result`
 *   in the stream that asked for it: it gets a `confirm` instead, and its `tool_result` comes first
 *   in the stream that answers the confirmation (`ok: false`, summary "The user declined." when
 *   declined).
 * - `confirm` `{ actionId, callId, name, title, input, details, expiresAt }`: a call is waiting for
 *   the user. `callId` is the `id` of its `tool_call`, `expiresAt` an ISO date (15 minutes).
 *   `details` `[{ label, value }]` is what the user checks, built by the server: the ids of `input`
 *   resolved to names (best effort, the raw value when a name cannot be found), and for `deploy`
 *   what the new deployment changes. `label` is a key the console translates.
 *   Answer it with a new `POST /assistant/chat` carrying the same conversation (it may end with the
 *   assistant's message) and `confirmation: { actionId, approved }`.
 * - `done` `{ stopReason, wrote, usage }`: the turn ended. `stopReason` is `end_turn`, `refusal`,
 *   `max_tokens`, `max_tool_rounds` or `awaiting_confirmation`; `wrote` is true when a write ran
 *   successfully during the turn, so the console reloads its data; `usage` `{ inputTokens,
 *   cachedInputTokens, outputTokens }` sums every model round of this answer (`inputTokens`
 *   includes the cached ones).
 * - `error` `{ code }`: the turn failed (`RATE_LIMITED` or `ASSISTANT_ERROR`).
 *
 * In one model round, reads run in parallel and writes one after the other in the order given.
 * Only one call per turn waits for confirmation: the calls needing one after it are refused, and
 * the other writes after it are not run, since they may depend on it. The turn so far is parked
 * with the action, so the model resumes it with its own messages (thinking and signatures included).
 */
import { FastifyBaseLogger } from "fastify"
import { z } from "zod"
import { describeToolError, MCP_TOOLS } from "../../mcp/server"
import { credentialLogFields, McpSession, McpToolContext, McpToolDefinition, requiresConfirmation } from "../../mcp/toolDefinition"
import { IUser } from "../../models/UserModel"
import { RoleInProject } from "../../models/UserProjectModel"
import { MCP_SCOPE_READ, MCP_SCOPE_WRITE } from "../../utils/oauthConfig"
import { AuthorizedPrincipal } from "../BaseAuthorizedService"
import { LlmMessage, LlmTool, LlmToolCall, LlmToolResult } from "../llm"
import { assistantOnlyTools } from "./assistantTools"
import { ConfirmationDetail, describeConfirmation } from "./confirmationDetails"
import { createPendingAction, PendingAssistantAction } from "./pendingActions"

/** A tool result is sent again on every later round of the turn: an oversized one is cut. */
const MAX_RESULT_CHARS_FOR_MODEL = 60_000
/** What the panel shows of a result: enough to read it, not a whole collection dump. */
const MAX_RESULT_CHARS_FOR_USER = 20_000
/**
 * The turn parked with an action, as JSON. Past it the oldest rounds are dropped: the round that
 * asked for the confirmation is always kept, since it is the one the model resumes from.
 */
export const MAX_PARKED_TURN_CHARS = 400_000

export const WAITING_FOR_CONFIRMATION = "Waiting for the user to confirm in the console."
export const ONE_CONFIRMATION_AT_A_TIME = "Only one confirmation at a time: ask again after this one is resolved"
export const AFTER_CONFIRMATION = "Not run: it comes after an action waiting for the user's confirmation. Call it again once that one is resolved."
export const DECLINED = "The user declined."

export type AssistantToolKind = "read" | "write" | "confirm" | "destructive"

export interface AssistantToolCallFrame {
    id: string
    name: string
    title: string
    input: Record<string, unknown>
    kind: AssistantToolKind
}

export interface AssistantToolResultFrame {
    id: string
    ok: boolean
    summary: string
    result?: unknown
}

export interface AssistantConfirmFrame {
    actionId: string
    callId: string
    name: string
    title: string
    input: Record<string, unknown>
    details: ConfirmationDetail[]
    expiresAt: string
}

export interface AssistantToolEvents {
    onToolCall: (frame: AssistantToolCallFrame) => void
    onToolResult: (frame: AssistantToolResultFrame) => void
    onConfirm: (frame: AssistantConfirmFrame) => void
}

export interface AssistantRoundOutcome {
    /** One per call, in the order of the calls. */
    results: LlmToolResult[]
    wrote: boolean
    awaitingConfirmation: boolean
}

/** Every MCP tool, the console-only ones included, and the tools only the assistant has. */
export const ASSISTANT_TOOLS: McpToolDefinition[] = [...MCP_TOOLS, ...assistantOnlyTools]

const toolsByName = new Map(ASSISTANT_TOOLS.map(tool => [tool.name, tool]))

/**
 * The input schema the model sees: the tool's own, without the `projectId` MCP clients pass. The
 * project is the one open in the console, taken from the request, never chosen by the model.
 */
export const toModelInputSchema = (schema: z.ZodObject): Record<string, unknown> => {
    const { $schema: _dialect, ...jsonSchema } = z.toJSONSchema(schema, { io: "input" })
    return jsonSchema
}

export const assistantToolDefinitions: LlmTool[] = ASSISTANT_TOOLS.map(tool => ({ name: tool.name, description: tool.description, inputSchema: toModelInputSchema(tool.inputSchema) }))

/** The scope decides what is a write, as it does for MCP; `requiresConfirmation` what waits for the user. */
export const toolKind = (tool: McpToolDefinition): AssistantToolKind => {
    if (tool.scope !== MCP_SCOPE_WRITE) return "read"
    if (!requiresConfirmation(tool)) return "write"
    return tool.annotations.destructiveHint ? "destructive" : "confirm"
}

const needsConfirmation = (tool: McpToolDefinition) => {
    const kind = toolKind(tool)
    return kind === "confirm" || kind === "destructive"
}

/** Input fields an audit line may carry: ids and short identifying values, never secrets or free text. */
const AUDITED_FIELDS = new Set(["email", "role", "name", "key", "originalKey", "slug", "enabled", "scope", "expiresAt", "version", "isProduction", "active"])
const MAX_AUDITED_CHARS = 200
const MAX_AUDITED_ITEMS = 50

export const auditedArgs = (args: Record<string, unknown>): Record<string, unknown> => {
    const audited: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(args)) {
        if (!AUDITED_FIELDS.has(key) && !/Ids?$/.test(key)) continue
        const short = (item: unknown) => (typeof item === "string" ? item.length <= MAX_AUDITED_CHARS : typeof item === "number" || typeof item === "boolean")
        if (short(value)) audited[key] = value
        else if (Array.isArray(value) && value.every(short)) audited[key] = value.slice(0, MAX_AUDITED_ITEMS)
    }
    return audited
}

/**
 * The turn to park with an action, as long as it fits: whole rounds (an assistant message and the
 * results after it) are dropped from the start until it does. When even the last round does not
 * fit, nothing is parked and the turn resumes from the confirmed call alone.
 */
export const parkableTurn = (turn: LlmMessage[]): LlmMessage[] | undefined => {
    let kept = turn
    while (JSON.stringify(kept).length > MAX_PARKED_TURN_CHARS) {
        const nextRound = kept.findIndex((message, index) => index > 0 && message.role === "assistant")
        if (nextRound <= 0) return undefined
        kept = kept.slice(nextRound)
    }
    return kept
}

const toModelContent = (value: unknown): string => {
    const json = JSON.stringify(value ?? null)
    return json.length > MAX_RESULT_CHARS_FOR_MODEL ? `${json.slice(0, MAX_RESULT_CHARS_FOR_MODEL)}… [cut at ${MAX_RESULT_CHARS_FOR_MODEL} of ${json.length} characters]` : json
}

const toUserResult = (value: unknown): unknown => {
    const json = JSON.stringify(value ?? null)
    return json.length > MAX_RESULT_CHARS_FOR_USER ? `${json.slice(0, MAX_RESULT_CHARS_FOR_USER)}…` : value
}

const summarize = (value: unknown): string => (Array.isArray(value) ? `${value.length} ${value.length === 1 ? "result" : "results"}` : "Done")

type PreparedCall = { ok: true; call: LlmToolCall; tool: McpToolDefinition; args: Record<string, unknown>; context: McpToolContext } | { ok: false; call: LlmToolCall; message: string }

interface ExecutedCall {
    result: LlmToolResult
    frame: AssistantToolResultFrame
    wrote: boolean
}

const refused = (call: LlmToolCall, message: string): ExecutedCall => ({
    result: { callId: call.id, name: call.name, isError: true, content: message },
    frame: { id: call.id, ok: false, summary: message },
    wrote: false
})

export interface AssistantToolRunnerOptions {
    user: IUser
    /** The project of the request (its header), the only one project tools act on. */
    projectId: string
    /** The user's role in that project: a VIEWER only reads. */
    role: string
    log?: FastifyBaseLogger
}

/**
 * Runs the model's tool calls for one conversation turn, with the same checks as the MCP server:
 * the input is validated against the tool's schema, a VIEWER cannot write, the principal of a
 * project tool is confined to the request's project (so every id in the input is verified against
 * it by the services), and errors are reported the way MCP clients get them.
 */
export class AssistantToolRunner {
    private readonly session: McpSession

    constructor(private readonly options: AssistantToolRunnerOptions) {
        // The request's user is a plain object (the authorization plugin copies the document), so
        // narrowing it per call with a spread keeps every field.
        const principal: AuthorizedPrincipal = { ...options.user }
        this.session = {
            principal,
            projects: [{ projectId: options.projectId, role: options.role }],
            scopes: [MCP_SCOPE_READ, MCP_SCOPE_WRITE],
            credential: { kind: "console", userId: String(principal._id) }
        }
    }

    /**
     * Runs the calls of one model round, parking the first one that needs a confirmation until the
     * user answers it. `turn` is the turn so far after the user's last message, ending with the
     * assistant message that made these calls: it is parked with the action so the turn can resume.
     */
    async runRound(calls: LlmToolCall[], events: AssistantToolEvents, turn: LlmMessage[] = []): Promise<AssistantRoundOutcome> {
        for (const call of calls) {
            const tool = toolsByName.get(call.name)
            events.onToolCall({ id: call.id, name: call.name, title: tool?.title ?? call.name, input: call.input, kind: tool ? toolKind(tool) : "read" })
        }

        const results: LlmToolResult[] = new Array(calls.length)
        let wrote = false
        const settle = (index: number, executed: ExecutedCall) => {
            results[index] = executed.result
            wrote ||= executed.wrote
            events.onToolResult(executed.frame)
        }

        const prepared = calls.map(call => this.prepare(call))
        const writes: number[] = []
        const reads: Promise<void>[] = []
        prepared.forEach((entry, index) => {
            if (!entry.ok) {
                settle(index, refused(entry.call, entry.message))
            } else if (toolKind(entry.tool) === "read") {
                reads.push(this.execute(entry).then(executed => settle(index, executed)))
            } else {
                writes.push(index)
            }
        })
        await Promise.all(reads)

        let waiting: Extract<PreparedCall, { ok: true }> | undefined
        for (const index of writes) {
            const entry = prepared[index] as Extract<PreparedCall, { ok: true }>
            if (waiting) {
                this.audit(entry.tool, "denied", { args: entry.args })
                settle(index, refused(entry.call, needsConfirmation(entry.tool) ? ONE_CONFIRMATION_AT_A_TIME : AFTER_CONFIRMATION))
            } else if (needsConfirmation(entry.tool)) {
                waiting = entry
                results[index] = { callId: entry.call.id, name: entry.call.name, content: WAITING_FOR_CONFIRMATION }
            } else {
                settle(index, await this.execute(entry))
            }
        }

        // Parked once the round is complete: the turn it carries holds every result of the round.
        if (waiting) {
            const details = await describeConfirmation(waiting.tool, waiting.args, waiting.context)
            const pending = await createPendingAction({
                userId: String(this.session.principal._id),
                projectId: this.options.projectId,
                tool: waiting.tool.name,
                args: waiting.call.input,
                callId: waiting.call.id,
                turn: turn.length ? parkableTurn([...turn, { role: "tool", results }]) : undefined
            })
            this.audit(waiting.tool, "pending", { args: waiting.args, actionId: pending.id })
            events.onConfirm({
                actionId: pending.id,
                callId: waiting.call.id,
                name: waiting.tool.name,
                title: waiting.tool.title,
                input: waiting.call.input,
                details,
                expiresAt: new Date(pending.expiresAt).toISOString()
            })
        }

        return { results, wrote, awaitingConfirmation: Boolean(waiting) }
    }

    /**
     * Runs (or not) an action the user answered. It goes through every check again: the role may
     * have changed, or the input may not be valid any more, in the minutes the user took.
     */
    async runConfirmed(action: PendingAssistantAction, approved: boolean, events: Pick<AssistantToolEvents, "onToolResult">): Promise<{ result: LlmToolResult; wrote: boolean }> {
        const call: LlmToolCall = { id: action.callId, name: action.tool, input: action.args }
        let executed: ExecutedCall
        if (!approved) {
            const tool = toolsByName.get(action.tool)
            if (tool) this.audit(tool, "declined", { args: action.args, actionId: action.id })
            executed = { result: { callId: call.id, name: call.name, content: DECLINED }, frame: { id: call.id, ok: false, summary: DECLINED }, wrote: false }
        } else {
            const prepared = this.prepare(call, action.id)
            executed = prepared.ok ? await this.execute(prepared, action.id) : refused(call, prepared.message)
            if (!executed.result.isError) {
                executed.result = { ...executed.result, content: `Done: ${executed.result.content}` }
            }
        }
        events.onToolResult(executed.frame)
        return { result: executed.result, wrote: executed.wrote }
    }

    private prepare(call: LlmToolCall, actionId?: string): PreparedCall {
        const tool = toolsByName.get(call.name)
        if (!tool) {
            return { ok: false, call, message: `Unknown tool "${call.name}"` }
        }
        const parsed = tool.inputSchema.safeParse(call.input)
        if (!parsed.success) {
            const issues = parsed.error.issues.map(issue => `${issue.path.join(".") || "input"}: ${issue.message}`).join("; ")
            return { ok: false, call, message: `Invalid input for ${tool.name}: ${issues}` }
        }
        const args = parsed.data as Record<string, unknown>

        // Organization tools act for the user: the services check the organization role.
        if (tool.projectScoped === false) {
            return {
                ok: true,
                call,
                tool,
                args,
                context: { principal: this.session.principal, projectId: "", scopes: this.session.scopes, credential: this.session.credential, session: this.session }
            }
        }
        const { projectId, role } = this.session.projects[0]
        // The console's REST services do not tell a VIEWER from a member: the refusal is here.
        if (tool.scope === MCP_SCOPE_WRITE && role === RoleInProject.VIEWER) {
            this.audit(tool, "denied", { args, actionId })
            return { ok: false, call, message: `You are a VIEWER on project ${projectId}: ${tool.name} changes data and is not allowed there.` }
        }
        return {
            ok: true,
            call,
            tool,
            args,
            context: {
                principal: { ...this.session.principal, restrictedToProjectIds: [projectId] },
                projectId,
                scopes: this.session.scopes,
                credential: this.session.credential,
                session: this.session
            }
        }
    }

    private async execute({ call, tool, args, context }: Extract<PreparedCall, { ok: true }>, actionId?: string): Promise<ExecutedCall> {
        try {
            const value = await tool.run(args as never, context)
            const { forModel, forUser } = tool.presentResult ? tool.presentResult(value) : { forModel: value, forUser: value }
            const shown = forUser === undefined ? forModel : forUser
            this.audit(tool, "ok", { args, actionId })
            return {
                result: { callId: call.id, name: call.name, content: toModelContent(forModel) },
                frame: { id: call.id, ok: true, summary: summarize(shown), result: toUserResult(shown) },
                wrote: toolKind(tool) !== "read"
            }
        } catch (error) {
            this.options.log?.warn({ err: error, tool: tool.name, projectId: context.projectId || undefined, ...credentialLogFields(this.session.credential) }, "Assistant tool failed")
            this.audit(tool, "error", { args, actionId })
            return refused(call, describeToolError(error))
        }
    }

    /**
     * One audit line per write, like the MCP server's, so both show up in the same searches. A
     * confirmed action carries its `actionId` on every line, from `pending` to its outcome; `args`
     * holds only ids and short identifying values (see `auditedArgs`).
     */
    private audit(tool: McpToolDefinition, outcome: "ok" | "error" | "denied" | "pending" | "declined", { args = {}, actionId }: { args?: Record<string, unknown>; actionId?: string } = {}) {
        if (toolKind(tool) === "read") return
        const organizationScoped = tool.projectScoped === false
        this.options.log?.info(
            {
                audit: "assistant_tool_call",
                tool: tool.name,
                outcome,
                actionId,
                projectId: organizationScoped ? undefined : this.options.projectId,
                organizationId: organizationScoped && typeof args.organizationId === "string" ? args.organizationId : undefined,
                args: auditedArgs(args),
                ...credentialLogFields(this.session.credential)
            },
            "Assistant tool call"
        )
    }
}
