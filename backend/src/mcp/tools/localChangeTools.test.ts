import { beforeEach, describe, expect, it, vi } from "vitest"
import { requiresConfirmation } from "../toolDefinition"
import { localChangeTools } from "./localChangeTools"

const { checkout, submit } = vi.hoisted(() => ({ checkout: vi.fn(), submit: vi.fn() }))

vi.mock("../../service/workspace/LocalChangeService", () => ({
    MAX_SUBMITTED_FILES: 100,
    default: class {
        checkout = checkout
        submit = submit
    }
}))

const MICROFRONTEND = "bbbbbbbbbbbbbbbbbbbbbbbb"
const SERVICE = "cccccccccccccccccccccccc"
const COMMIT = "a".repeat(40)

const tool = (name: string) => localChangeTools.find(candidate => candidate.name === name)!
const run = (name: string, args: Record<string, unknown>) => tool(name).run(tool(name).inputSchema.parse(args) as never, { principal: {} } as never)

beforeEach(() => vi.clearAllMocks())

describe("localChangeTools", () => {
    it("reads the checkout of a microfrontend or a service", async () => {
        await run("repository_checkout_get", { microfrontendId: MICROFRONTEND })
        await run("repository_checkout_get", { serviceId: SERVICE })
        expect(checkout.mock.calls).toEqual([[{ kind: "microfrontend", id: MICROFRONTEND }], [{ kind: "service", id: SERVICE }]])
    })

    it("wants exactly one target", async () => {
        await expect(run("repository_checkout_get", {})).rejects.toThrow("either microfrontendId or serviceId")
        await expect(run("repository_checkout_get", { microfrontendId: MICROFRONTEND, serviceId: SERVICE })).rejects.toThrow("either microfrontendId or serviceId")
    })

    it("submits the change without the target fields", async () => {
        const files = [{ path: "src/a.ts", action: "update", content: "x" }]
        await run("code_change_submit", { serviceId: SERVICE, baseCommit: COMMIT, title: "Fix", files })
        expect(submit).toHaveBeenCalledWith({ kind: "service", id: SERVICE }, { baseCommit: COMMIT, title: "Fix", files })
    })

    it("wants a full commit hash and at least one file", () => {
        const schema = tool("code_change_submit").inputSchema
        expect(schema.safeParse({ microfrontendId: MICROFRONTEND, baseCommit: "abc123", title: "Fix", files: [{ path: "a", action: "delete" }] }).success).toBe(false)
        expect(schema.safeParse({ microfrontendId: MICROFRONTEND, baseCommit: COMMIT, title: "Fix", files: [] }).success).toBe(false)
    })

    it("asks the console user before pushing", () => {
        expect(requiresConfirmation(tool("code_change_submit"))).toBe(true)
        expect(tool("repository_checkout_get").scope).toBe("mfe:read")
        expect(tool("code_change_submit").scope).toBe("mfe:write")
    })
})
