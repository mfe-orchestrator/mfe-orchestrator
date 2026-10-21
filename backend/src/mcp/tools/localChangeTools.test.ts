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
const COMMIT = "a".repeat(40)

const tool = (name: string) => localChangeTools.find(candidate => candidate.name === name)!
const run = (name: string, args: Record<string, unknown>) => tool(name).run(tool(name).inputSchema.parse(args) as never, { principal: {} } as never)

beforeEach(() => vi.clearAllMocks())

describe("localChangeTools", () => {
    it("reads the checkout of a microfrontend", async () => {
        await run("repository_checkout_get", { microfrontendId: MICROFRONTEND })
        expect(checkout).toHaveBeenCalledWith(MICROFRONTEND)
    })

    it("wants the microfrontend", () => {
        expect(tool("repository_checkout_get").inputSchema.safeParse({}).success).toBe(false)
    })

    it("submits the change without the target fields", async () => {
        const files = [{ path: "src/a.ts", action: "update", content: "x" }]
        await run("code_change_submit", { microfrontendId: MICROFRONTEND, baseCommit: COMMIT, title: "Fix", files })
        expect(submit).toHaveBeenCalledWith(MICROFRONTEND, { baseCommit: COMMIT, title: "Fix", files })
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
