import { beforeEach, describe, expect, it, vi } from "vitest"
import { createBusinessException } from "../../errors/BusinessException"
import UserCannotAccessThisProjectError from "../../errors/UserCannotAccessThisProjectError"
import { McpSession, McpToolContext } from "../toolDefinition"
import { aiChangeTools } from "./aiChangeTools"

const createChange = vi.fn()
const listChanges = vi.fn()
const getChange = vi.fn()
const applyChange = vi.fn()
const discardChange = vi.fn()

const { constructed } = vi.hoisted(() => ({ constructed: [] as unknown[][] }))

vi.mock("../..", () => ({ fastify: { config: { AI_PROVIDER: "anthropic" } } }))
vi.mock("../../service/aiChange/AiChangeService", () => ({
    default: class {
        constructor(...args: unknown[]) {
            constructed.push(args)
        }
        create = (...args: unknown[]) => createChange(...args)
        list = (...args: unknown[]) => listChanges(...args)
        get = (...args: unknown[]) => getChange(...args)
        apply = (...args: unknown[]) => applyChange(...args)
        discard = (...args: unknown[]) => discardChange(...args)
    }
}))

const PROJECT = "aaaaaaaaaaaaaaaaaaaaaaaa"
const MICROFRONTEND = "bbbbbbbbbbbbbbbbbbbbbbbb"
const CHANGE = "cccccccccccccccccccccccc"

const tool = (name: string) => aiChangeTools.find(candidate => candidate.name === name)!

const context = (): McpToolContext => {
    const session: McpSession = {
        principal: { _id: "user-1", email: "user@example.com" } as never,
        projects: [{ projectId: PROJECT, role: "MEMBER" }],
        scopes: ["mfe:read", "mfe:write"],
        credential: { kind: "console", userId: "user-1" }
    }
    return { principal: { ...session.principal, restrictedToProjectIds: [PROJECT] }, projectId: PROJECT, scopes: session.scopes, credential: session.credential, session }
}

const run = (name: string, args: Record<string, unknown>) => tool(name).run(args as never, context())

const changeDocument = (status: string) => ({
    _id: { toString: () => CHANGE },
    microfrontendId: MICROFRONTEND,
    status,
    prompt: "Add a footer",
    baseBranch: "main",
    summary: "Adds a footer",
    files: [{ path: "src/Footer.tsx", action: "create", proposedContent: "export const Footer = () => null", originalContent: "old" }],
    events: Array.from({ length: 15 }, (_, index) => ({ at: new Date(0), kind: "tool", message: `step ${index}` })),
    createdAt: new Date(0),
    updatedAt: new Date(0)
})

const forbidden = () => createBusinessException({ code: "AI_CHANGE_FORBIDDEN", message: "A viewer cannot change the code of a microfrontend", statusCode: 403 })

describe("AI change tools", () => {
    beforeEach(() => {
        for (const mock of [createChange, listChanges, getChange, applyChange, discardChange]) {
            mock.mockReset()
        }
        constructed.length = 0
    })

    it("given their definitions, when read, then every one is console-only and applying (a pull request) is the destructive, open world one", () => {
        for (const definition of aiChangeTools) {
            expect(definition.consoleOnly, definition.name).toBe(true)
        }
        expect(tool("ai_change_apply").annotations).toMatchObject({ destructiveHint: true, openWorldHint: true })
        expect(aiChangeTools.filter(definition => definition.annotations.destructiveHint).map(definition => definition.name)).toEqual(["ai_change_apply"])
    })

    describe("ai_change_start", () => {
        it("given a prompt, when started, then the service gets the project-bound principal and the configuration, and the view leaves file contents out", async () => {
            createChange.mockResolvedValue(changeDocument("PENDING"))

            const result = (await run("ai_change_start", { microfrontendId: MICROFRONTEND, prompt: "Add a footer" })) as Record<string, unknown>

            expect(createChange).toHaveBeenCalledWith(MICROFRONTEND, { prompt: "Add a footer", baseBranch: undefined })
            expect(constructed[0]).toEqual([expect.objectContaining({ restrictedToProjectIds: [PROJECT] }), { AI_PROVIDER: "anthropic" }])
            expect(result).toMatchObject({ id: CHANGE, status: "PENDING", files: [{ path: "src/Footer.tsx", action: "create" }] })
            expect(JSON.stringify(result)).not.toContain("export const Footer")
            expect(result.recentEvents).toHaveLength(10)
        })

        it("given an empty prompt, when the input is validated, then it is refused", () => {
            expect(tool("ai_change_start").inputSchema.safeParse({ microfrontendId: MICROFRONTEND, prompt: "  " }).success).toBe(false)
        })

        it("given a viewer, when started, then the service's refusal surfaces", async () => {
            createChange.mockRejectedValue(forbidden())

            await expect(run("ai_change_start", { microfrontendId: MICROFRONTEND, prompt: "Add a footer" })).rejects.toMatchObject({ code: "AI_CHANGE_FORBIDDEN" })
        })
    })

    describe("ai_changes_list", () => {
        it("given a microfrontend, when listed, then each change is a view", async () => {
            listChanges.mockResolvedValue([changeDocument("PROPOSED")])

            expect(await run("ai_changes_list", { microfrontendId: MICROFRONTEND })).toEqual([expect.objectContaining({ id: CHANGE, status: "PROPOSED" })])
            expect(listChanges).toHaveBeenCalledWith(MICROFRONTEND)
        })

        it("given a microfrontend of another project, when listed, then the refusal surfaces", async () => {
            listChanges.mockRejectedValue(new UserCannotAccessThisProjectError())

            await expect(run("ai_changes_list", { microfrontendId: MICROFRONTEND })).rejects.toBeInstanceOf(UserCannotAccessThisProjectError)
        })
    })

    describe("ai_change_get", () => {
        it("given a change, when read, then its status and files are returned", async () => {
            getChange.mockResolvedValue(changeDocument("PROPOSED"))

            expect(await run("ai_change_get", { changeId: CHANGE })).toMatchObject({ id: CHANGE, status: "PROPOSED", summary: "Adds a footer" })
            expect(getChange).toHaveBeenCalledWith(CHANGE)
        })

        it("given a change of another project, when read, then the refusal surfaces", async () => {
            getChange.mockRejectedValue(new UserCannotAccessThisProjectError())

            await expect(run("ai_change_get", { changeId: CHANGE })).rejects.toBeInstanceOf(UserCannotAccessThisProjectError)
        })
    })

    describe("ai_change_apply", () => {
        it("given a proposal, when applied, then the excluded paths reach the service and the pull request comes back", async () => {
            applyChange.mockResolvedValue({ ...changeDocument("APPLIED"), pullRequestUrl: "https://github.com/acme/cart/pull/7" })

            const result = await run("ai_change_apply", { changeId: CHANGE, excludePaths: ["README.md"] })

            expect(applyChange).toHaveBeenCalledWith(CHANGE, { excludePaths: ["README.md"] })
            expect(result).toMatchObject({ status: "APPLIED", pullRequestUrl: "https://github.com/acme/cart/pull/7" })
        })

        it("given a viewer, when applied, then the service's refusal surfaces", async () => {
            applyChange.mockRejectedValue(forbidden())

            await expect(run("ai_change_apply", { changeId: CHANGE })).rejects.toMatchObject({ code: "AI_CHANGE_FORBIDDEN" })
        })
    })

    describe("ai_change_discard", () => {
        it("given a proposal, when discarded, then the discarded change is returned", async () => {
            discardChange.mockResolvedValue(changeDocument("DISCARDED"))

            expect(await run("ai_change_discard", { changeId: CHANGE })).toMatchObject({ status: "DISCARDED" })
            expect(discardChange).toHaveBeenCalledWith(CHANGE)
        })

        it("given a change that is not a proposal, when discarded, then the service's refusal surfaces", async () => {
            discardChange.mockRejectedValue(createBusinessException({ code: "AI_CHANGE_NOT_PROPOSED", message: "Only a proposal can be discarded", statusCode: 409 }))

            await expect(run("ai_change_discard", { changeId: CHANGE })).rejects.toMatchObject({ code: "AI_CHANGE_NOT_PROPOSED" })
        })
    })
})
