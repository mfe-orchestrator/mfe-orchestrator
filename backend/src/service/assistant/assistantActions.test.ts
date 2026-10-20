import { FastifyBaseLogger } from "fastify"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { EntityNotFoundError } from "../../errors/EntityNotFoundError"
import { McpToolDefinition } from "../../mcp/toolDefinition"
import { IUser } from "../../models/UserModel"
import { LlmMessage, LlmToolCall } from "../llm"
import {
    AFTER_CONFIRMATION,
    ASSISTANT_TOOLS,
    AssistantToolEvents,
    AssistantToolRunner,
    assistantToolDefinitions,
    auditedArgs,
    DECLINED,
    MAX_PARKED_TURN_CHARS,
    ONE_CONFIRMATION_AT_A_TIME,
    parkableTurn,
    toolKind,
    WAITING_FOR_CONFIRMATION
} from "./assistantActions"
import { takePendingAction } from "./pendingActions"

const getEnvironments = vi.fn()
const createEnvironment = vi.fn()
const deleteEnvironment = vi.fn()
const environmentPrincipals: unknown[] = []

vi.mock("../EnvironmentService", () => ({
    default: class {
        constructor(principal: unknown) {
            environmentPrincipals.push(principal)
        }
        getByProjectId = getEnvironments
        create = createEnvironment
        deleteSingle = deleteEnvironment
    }
}))

const PROJECT = "aaaaaaaaaaaaaaaaaaaaaaaa"
const ENVIRONMENT = "bbbbbbbbbbbbbbbbbbbbbbbb"
const OTHER_ENVIRONMENT = "cccccccccccccccccccccccc"
const user = { _id: "user-1", email: "user@example.com" } as unknown as IUser

const log = { info: vi.fn(), warn: vi.fn() }
const runnerFor = (role = "MEMBER") => new AssistantToolRunner({ user, projectId: PROJECT, role, log: log as unknown as FastifyBaseLogger })

const recordEvents = () => {
    const frames: { event: string; frame: Record<string, unknown> }[] = []
    const events: AssistantToolEvents = {
        onToolCall: frame => frames.push({ event: "tool_call", frame: { ...frame } }),
        onToolResult: frame => frames.push({ event: "tool_result", frame: { ...frame } }),
        onConfirm: frame => frames.push({ event: "confirm", frame: { ...frame } })
    }
    return { frames, events }
}

const call = (id: string, name: string, input: Record<string, unknown> = {}): LlmToolCall => ({ id, name, input })
const newEnvironment = (slug: string) => ({ name: slug, slug, color: "#22c55e" })

/** Swaps fields of a registry tool for one test: the runner reads the very same objects. */
const patchTool = (name: string, patch: Partial<McpToolDefinition>) => {
    const tool = ASSISTANT_TOOLS.find(candidate => candidate.name === name)!
    const original = { ...tool }
    Object.assign(tool, patch)
    return () => {
        for (const key of Object.keys(patch)) delete (tool as unknown as Record<string, unknown>)[key]
        Object.assign(tool, original)
    }
}

describe("assistantToolDefinitions", () => {
    it("Given every tool, when converted for the model, then it is a JSON schema object with no projectId and no dialect header", () => {
        for (const definition of assistantToolDefinitions) {
            expect(definition.inputSchema.type, definition.name).toBe("object")
            expect(definition.inputSchema, definition.name).not.toHaveProperty("$schema")
            expect(Object.keys((definition.inputSchema.properties as Record<string, unknown>) ?? {}), definition.name).not.toContain("projectId")
        }
    })

    it("Given the MCP tools and the assistant's own, when listed, then the reads and writes of MCP are there with the two tools MCP lacks and no duplicate", () => {
        const names = assistantToolDefinitions.map(definition => definition.name)

        expect(names).toEqual(expect.arrayContaining(["environments_list", "environment_create", "deploy", "search_docs", "get_failed_build_logs"]))
        expect(names).not.toContain("list_environments")
        expect(new Set(names).size).toBe(names.length)
    })

    it("Given a tool input with a field description, when converted, then the model sees the description", () => {
        const logs = assistantToolDefinitions.find(definition => definition.name === "get_failed_build_logs")!

        expect(logs.inputSchema).toMatchObject({ properties: { runId: { type: "string", description: expect.stringContaining("CI run") } }, required: ["runId"] })
    })
})

describe("confirmation policy", () => {
    const CONFIRMED_WRITES = ["project_member_invite", "project_member_resend_invitation", "organization_member_invite", "api_key_create", "ai_change_discard", "canary_users_set"]

    it("Given tools that grant access or cannot be undone, when classified, then they wait for the user while their MCP annotations stay non-destructive", () => {
        for (const name of CONFIRMED_WRITES) {
            const tool = ASSISTANT_TOOLS.find(candidate => candidate.name === name)!
            expect(toolKind(tool), name).toBe("confirm")
            expect(tool.annotations.destructiveHint, name).toBe(false)
        }
    })

    it("Given every destructive tool, when classified, then it still waits for the user, and ordinary writes still run directly", () => {
        for (const tool of ASSISTANT_TOOLS.filter(candidate => candidate.annotations.destructiveHint)) {
            expect(toolKind(tool), tool.name).toBe("destructive")
        }
        expect(toolKind(ASSISTANT_TOOLS.find(tool => tool.name === "environment_create")!)).toBe("write")
    })

    it("Given the domain and service tools, when classified, then the deletes wait for the user, the other writes run directly and the reads are reads", () => {
        const kindOf = (name: string) => toolKind(ASSISTANT_TOOLS.find(tool => tool.name === name)!)

        expect(kindOf("domain_delete")).toBe("destructive")
        expect(kindOf("service_delete")).toBe("destructive")
        for (const name of ["domain_create", "domain_update", "service_create", "service_update"]) {
            expect(kindOf(name), name).toBe("write")
        }
        for (const name of ["domains_list", "domain_get", "services_list", "service_get"]) {
            expect(kindOf(name), name).toBe("read")
        }
    })
})

describe("auditedArgs", () => {
    it("Given an input with ids, names and free text, when audited, then only ids and short identifying values are kept", () => {
        expect(
            auditedArgs({
                organizationId: "o1",
                environmentIds: ["e1", "e2"],
                email: "ada@example.com",
                role: "OWNER",
                name: "x".repeat(201),
                prompt: "Rewrite the checkout",
                values: [{ environmentId: "e1", value: "secret" }],
                description: "a description"
            })
        ).toEqual({ organizationId: "o1", environmentIds: ["e1", "e2"], email: "ada@example.com", role: "OWNER" })
    })
})

describe("parkableTurn", () => {
    const round = (id: string, size: number): LlmMessage[] => [
        { role: "assistant", text: "", toolCalls: [{ id, name: "environments_list", input: {} }] },
        { role: "tool", results: [{ callId: id, name: "environments_list", content: "x".repeat(size) }] }
    ]

    it("Given a turn too large to park, when parked, then the oldest rounds are dropped and the last one is kept", () => {
        const kept = parkableTurn([...round("r1", MAX_PARKED_TURN_CHARS), ...round("r2", 10)])

        expect(kept).toEqual(round("r2", 10))
    })

    it("Given a last round that alone is too large, when parked, then nothing is parked", () => {
        expect(parkableTurn(round("r1", MAX_PARKED_TURN_CHARS + 1))).toBeUndefined()
    })
})

describe("AssistantToolRunner.runRound", () => {
    beforeEach(() => {
        getEnvironments.mockReset().mockResolvedValue([{ _id: ENVIRONMENT, name: "Production" }])
        createEnvironment.mockReset().mockImplementation(async (body: { slug: string }) => ({ _id: OTHER_ENVIRONMENT, ...body }))
        deleteEnvironment.mockReset().mockResolvedValue(undefined)
        environmentPrincipals.length = 0
        log.info.mockReset()
        log.warn.mockReset()
    })

    it("Given a read, when run, then it acts on the request's project only and both the model and the user get its result", async () => {
        const { frames, events } = recordEvents()

        const outcome = await runnerFor().runRound([call("c1", "environments_list")], events)

        expect(getEnvironments).toHaveBeenCalledWith(PROJECT)
        expect(environmentPrincipals[0]).toMatchObject({ _id: "user-1", restrictedToProjectIds: [PROJECT] })
        expect(outcome).toMatchObject({ wrote: false, awaitingConfirmation: false })
        expect(JSON.parse(outcome.results[0].content)).toEqual([{ _id: ENVIRONMENT, name: "Production" }])
        expect(frames).toEqual([
            { event: "tool_call", frame: { id: "c1", name: "environments_list", title: "List environments", input: {}, kind: "read" } },
            { event: "tool_result", frame: { id: "c1", ok: true, summary: "1 result", result: [{ _id: ENVIRONMENT, name: "Production" }] } }
        ])
    })

    it("Given a projectId sent by the model, when the call is validated, then it is dropped: the project comes from the request", async () => {
        await runnerFor().runRound([call("c1", "environment_create", { ...newEnvironment("qa"), projectId: "dddddddddddddddddddddddd" })], recordEvents().events)

        expect(createEnvironment).toHaveBeenCalledWith(newEnvironment("qa"), PROJECT)
    })

    it("Given a tool that does not exist, when called, then an error result names it", async () => {
        const { frames, events } = recordEvents()

        const outcome = await runnerFor().runRound([call("c1", "drop_database")], events)

        expect(outcome.results[0]).toMatchObject({ callId: "c1", isError: true, content: 'Unknown tool "drop_database"' })
        expect(frames[1]).toEqual({ event: "tool_result", frame: { id: "c1", ok: false, summary: 'Unknown tool "drop_database"' } })
    })

    it("Given an input that does not match the schema, when called, then the issues go back to the model and nothing runs", async () => {
        const outcome = await runnerFor().runRound([call("c1", "environment_create", { name: "QA", slug: "Not A Slug" })], recordEvents().events)

        expect(outcome.results[0].isError).toBe(true)
        expect(outcome.results[0].content).toMatch(/^Invalid input for environment_create: .*slug: lowercase letters, digits and dashes.*color/)
        expect(createEnvironment).not.toHaveBeenCalled()
    })

    it("Given a VIEWER, when a write is asked, then it is refused like on MCP and audited, while reads still run", async () => {
        const outcome = await runnerFor("VIEWER").runRound([call("c1", "environment_create", newEnvironment("qa")), call("c2", "environments_list")], recordEvents().events)

        expect(outcome.results[0]).toMatchObject({ isError: true, content: `You are a VIEWER on project ${PROJECT}: environment_create changes data and is not allowed there.` })
        expect(outcome.results[1].isError).toBeUndefined()
        expect(createEnvironment).not.toHaveBeenCalled()
        expect(outcome.wrote).toBe(false)
        expect(log.info).toHaveBeenCalledWith(
            expect.objectContaining({ audit: "assistant_tool_call", tool: "environment_create", outcome: "denied", projectId: PROJECT, authKind: "console", userId: "user-1" }),
            "Assistant tool call"
        )
    })

    it("Given a VIEWER, when a destructive action is asked, then it is refused at once instead of waiting for a confirmation", async () => {
        const { frames, events } = recordEvents()

        const outcome = await runnerFor("VIEWER").runRound([call("c1", "environment_delete", { environmentId: ENVIRONMENT })], events)

        expect(outcome.awaitingConfirmation).toBe(false)
        expect(frames.map(entry => entry.event)).toEqual(["tool_call", "tool_result"])
    })

    it("Given a write, when it succeeds, then the turn is marked as having written and an audit line is logged", async () => {
        const { frames, events } = recordEvents()

        const outcome = await runnerFor().runRound([call("c1", "environment_create", newEnvironment("qa"))], events)

        expect(outcome.wrote).toBe(true)
        expect(frames[0].frame.kind).toBe("write")
        expect(frames[1].frame).toMatchObject({ id: "c1", ok: true, summary: "Done" })
        expect(log.info).toHaveBeenCalledWith(
            expect.objectContaining({ audit: "assistant_tool_call", tool: "environment_create", outcome: "ok", projectId: PROJECT, userId: "user-1" }),
            "Assistant tool call"
        )
    })

    it("Given several writes in one round, when run, then they run one after the other in the order given", async () => {
        const steps: string[] = []
        createEnvironment.mockImplementation(async (body: { slug: string }) => {
            steps.push(`start ${body.slug}`)
            await new Promise(resolve => setTimeout(resolve, body.slug === "first" ? 20 : 0))
            steps.push(`end ${body.slug}`)
            return body
        })

        await runnerFor().runRound([call("c1", "environment_create", newEnvironment("first")), call("c2", "environment_create", newEnvironment("second"))], recordEvents().events)

        expect(steps).toEqual(["start first", "end first", "start second", "end second"])
    })

    it("Given a destructive call, when the round runs, then nothing is deleted, the user is asked and the action is parked for this user and project", async () => {
        const { frames, events } = recordEvents()

        const outcome = await runnerFor().runRound([call("c1", "environment_delete", { environmentId: ENVIRONMENT })], events)

        expect(deleteEnvironment).not.toHaveBeenCalled()
        expect(outcome).toMatchObject({ awaitingConfirmation: true, wrote: false })
        expect(outcome.results[0]).toEqual({ callId: "c1", name: "environment_delete", content: WAITING_FOR_CONFIRMATION })
        expect(frames[0].frame.kind).toBe("destructive")
        const confirm = frames.find(entry => entry.event === "confirm")!.frame
        expect(confirm).toMatchObject({ callId: "c1", name: "environment_delete", title: "Delete environment", input: { environmentId: ENVIRONMENT } })
        expect(new Date(confirm.expiresAt as string).getTime()).toBeGreaterThan(Date.now())
        expect(frames.some(entry => entry.event === "tool_result")).toBe(false)

        await expect(takePendingAction(confirm.actionId as string, "user-2", PROJECT)).rejects.toMatchObject({ code: "ASSISTANT_ACTION_NOT_FOUND" })
        await expect(takePendingAction(confirm.actionId as string, "user-1", PROJECT)).resolves.toMatchObject({ tool: "environment_delete", callId: "c1", args: { environmentId: ENVIRONMENT } })
    })

    it("Given two destructive calls and a write after them, when the round runs, then only the first waits, the second is refused and the write is not run", async () => {
        const { frames, events } = recordEvents()

        const outcome = await runnerFor().runRound(
            [
                call("c1", "environment_delete", { environmentId: ENVIRONMENT }),
                call("c2", "environment_delete", { environmentId: OTHER_ENVIRONMENT }),
                call("c3", "environment_create", newEnvironment("qa"))
            ],
            events
        )

        expect(frames.filter(entry => entry.event === "confirm")).toHaveLength(1)
        expect(outcome.results[1]).toMatchObject({ callId: "c2", isError: true, content: ONE_CONFIRMATION_AT_A_TIME })
        expect(outcome.results[2]).toMatchObject({ callId: "c3", isError: true, content: AFTER_CONFIRMATION })
        expect(createEnvironment).not.toHaveBeenCalled()
        expect(deleteEnvironment).not.toHaveBeenCalled()
    })

    it("Given a round with a read and a destructive call, when parked, then the turn so far is kept with every result of the round and a placeholder for the waiting call", async () => {
        const { frames, events } = recordEvents()
        const assistant: LlmMessage = { role: "assistant", text: "", toolCalls: [], native: [{ type: "thinking", signature: "sig" }] }

        await runnerFor().runRound([call("c1", "environments_list"), call("c2", "environment_delete", { environmentId: ENVIRONMENT })], events, [assistant])

        const confirm = frames.find(entry => entry.event === "confirm")!.frame
        const action = await takePendingAction(confirm.actionId as string, "user-1", PROJECT)
        expect(action.turn?.[0]).toEqual(assistant)
        expect(action.turn?.[1]).toEqual({
            role: "tool",
            results: [expect.objectContaining({ callId: "c1", content: expect.stringContaining("Production") }), { callId: "c2", name: "environment_delete", content: WAITING_FOR_CONFIRMATION }]
        })
        expect(confirm.details).toEqual(expect.arrayContaining([{ label: "environment", value: "Production" }]))
    })

    it("Given a tool that grants access without being destructive, when called, then it waits for the user with kind confirm and is audited with the action id", async () => {
        const { frames, events } = recordEvents()

        const outcome = await runnerFor().runRound([call("c1", "project_member_invite", { email: "ada@example.com", role: "OWNER" })], events)

        expect(outcome.awaitingConfirmation).toBe(true)
        expect(frames[0].frame.kind).toBe("confirm")
        const confirm = frames.find(entry => entry.event === "confirm")!.frame
        expect(confirm.details).toEqual(
            expect.arrayContaining([
                { label: "email", value: "ada@example.com" },
                { label: "role", value: "OWNER" }
            ])
        )
        expect(log.info).toHaveBeenCalledWith(
            expect.objectContaining({ tool: "project_member_invite", outcome: "pending", actionId: confirm.actionId, args: { email: "ada@example.com", role: "OWNER" } }),
            "Assistant tool call"
        )
    })

    it("Given a write before a destructive call, when the round runs, then the write runs and the destructive one waits", async () => {
        const outcome = await runnerFor().runRound([call("c1", "environment_create", newEnvironment("qa")), call("c2", "environment_delete", { environmentId: ENVIRONMENT })], recordEvents().events)

        expect(createEnvironment).toHaveBeenCalledTimes(1)
        expect(outcome).toMatchObject({ wrote: true, awaitingConfirmation: true })
    })

    describe("with a tool whose result holds a secret", () => {
        let restore: () => void

        beforeEach(() => {
            restore = patchTool("environments_list", { presentResult: () => ({ forModel: { id: "key-1" }, forUser: { id: "key-1", key: "secret-value" } }) })
        })

        afterEach(() => restore())

        it("Given presentResult, when the tool runs, then the model gets forModel only and the user forUser", async () => {
            const { frames, events } = recordEvents()

            const outcome = await runnerFor().runRound([call("c1", "environments_list")], events)

            expect(outcome.results[0].content).toBe('{"id":"key-1"}')
            expect(outcome.results[0].content).not.toContain("secret-value")
            expect(frames[1].frame.result).toEqual({ id: "key-1", key: "secret-value" })
        })
    })

    it("Given an organization tool, when run, then it gets the user's own principal, not one confined to the project", async () => {
        const seen: unknown[] = []
        const restore = patchTool("organizations_list", {
            run: async (_args, context) => {
                seen.push(context)
                return []
            }
        })
        try {
            await runnerFor().runRound([call("c1", "organizations_list")], recordEvents().events)
        } finally {
            restore()
        }

        expect(seen[0]).toMatchObject({ projectId: "", credential: { kind: "console", userId: "user-1" } })
        expect((seen[0] as { principal: object }).principal).not.toHaveProperty("restrictedToProjectIds")
    })

    it("Given a service error, when the tool fails, then the model gets the same message an MCP client would and the details stay in the log", async () => {
        getEnvironments.mockRejectedValueOnce(new EntityNotFoundError("x")).mockRejectedValueOnce(new Error("connection to 10.0.0.12:27017 refused"))

        const outcome = await runnerFor().runRound([call("c1", "environments_list"), call("c2", "environments_list")], recordEvents().events)

        expect(outcome.results.map(result => result.content)).toEqual(["Not found in this project", "The operation failed. Check the console for details."])
        expect(log.warn).toHaveBeenCalledTimes(2)
    })

    it("Given a huge result, when sent, then the user gets a cut preview instead of the whole collection", async () => {
        getEnvironments.mockResolvedValue([{ name: "x".repeat(30_000) }])
        const { frames, events } = recordEvents()

        await runnerFor().runRound([call("c1", "environments_list")], events)

        expect(typeof frames[1].frame.result).toBe("string")
        expect((frames[1].frame.result as string).length).toBeLessThanOrEqual(20_001)
    })
})

describe("AssistantToolRunner.runConfirmed", () => {
    const action = { id: "a1", userId: "user-1", projectId: PROJECT, tool: "environment_delete", args: { environmentId: ENVIRONMENT }, callId: "c1", createdAt: 0, expiresAt: 0 }

    beforeEach(() => {
        deleteEnvironment.mockReset().mockResolvedValue(undefined)
        log.info.mockReset()
    })

    it("Given an approved action, when run, then it executes and the model is told it is done", async () => {
        const { frames, events } = recordEvents()

        const outcome = await runnerFor().runConfirmed(action, true, events)

        expect(deleteEnvironment).toHaveBeenCalledWith(ENVIRONMENT)
        expect(outcome.wrote).toBe(true)
        expect(outcome.result).toEqual({ callId: "c1", name: "environment_delete", content: 'Done: {"deleted":true}' })
        expect(frames).toEqual([{ event: "tool_result", frame: { id: "c1", ok: true, summary: "Done", result: { deleted: true } } }])
    })

    it("Given an approved organization action, when run, then the audit line names the action, the organization and the arguments", async () => {
        const restore = patchTool("organization_member_remove", { run: async () => ({ removed: true }) })
        const organizationId = "dddddddddddddddddddddddd"
        const userId = "eeeeeeeeeeeeeeeeeeeeeeee"
        try {
            await runnerFor().runConfirmed({ ...action, id: "a9", tool: "organization_member_remove", args: { organizationId, userId } }, true, recordEvents().events)
        } finally {
            restore()
        }

        expect(log.info).toHaveBeenCalledWith(
            expect.objectContaining({ tool: "organization_member_remove", outcome: "ok", actionId: "a9", organizationId, projectId: undefined, args: { organizationId, userId } }),
            "Assistant tool call"
        )
    })

    it("Given a declined action, when answered, then nothing runs and the model is told the user declined", async () => {
        const { frames, events } = recordEvents()

        const outcome = await runnerFor().runConfirmed(action, false, events)

        expect(deleteEnvironment).not.toHaveBeenCalled()
        expect(outcome).toEqual({ result: { callId: "c1", name: "environment_delete", content: DECLINED }, wrote: false })
        expect(frames).toEqual([{ event: "tool_result", frame: { id: "c1", ok: false, summary: DECLINED } }])
        expect(log.info).toHaveBeenCalledWith(expect.objectContaining({ outcome: "declined", actionId: "a1", args: { environmentId: ENVIRONMENT } }), "Assistant tool call")
    })

    it("Given a user demoted to VIEWER while the card was open, when the action is approved, then it is refused", async () => {
        const outcome = await runnerFor("VIEWER").runConfirmed(action, true, recordEvents().events)

        expect(deleteEnvironment).not.toHaveBeenCalled()
        expect(outcome.result.isError).toBe(true)
        expect(outcome.wrote).toBe(false)
    })
})
