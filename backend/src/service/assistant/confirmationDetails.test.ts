import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../..", () => ({ fastify: { log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }, config: {} } }))

const environments = vi.fn()
const environmentById = vi.fn()
const microfrontends = vi.fn()
const deploymentsOf = vi.fn()
const deploymentById = vi.fn()
const variablesOf = vi.fn()
const projectById = vi.fn()
const projectUsers = vi.fn()
const aiChange = vi.fn()

vi.mock("../EnvironmentService", () => ({
    default: class {
        getByProjectId = environments
        getById = environmentById
    }
}))
vi.mock("../MicrofrontendService", () => ({
    default: class {
        getByProjectId = microfrontends
    }
}))
vi.mock("../DeploymentService", () => ({
    default: class {
        getByEnvironmentId = deploymentsOf
        getById = deploymentById
    }
}))
vi.mock("../GlobalVariablesService", () => ({
    default: class {
        getAll = variablesOf
    }
}))
vi.mock("../ProjectService", () => ({
    default: class {
        findById = projectById
    }
}))
vi.mock("../UserProjectService", () => ({
    default: class {
        getProjectUsers = projectUsers
    }
}))
vi.mock("../aiChange/AiChangeService", () => ({
    default: class {
        get = aiChange
    }
}))

import { McpToolContext } from "../../mcp/toolDefinition"
import { ASSISTANT_TOOLS } from "./assistantActions"
import { describeConfirmation, describeServedChanges } from "./confirmationDetails"

const PROJECT = "aaaaaaaaaaaaaaaaaaaaaaaa"
const PRODUCTION = "bbbbbbbbbbbbbbbbbbbbbbbb"
const STAGING = "cccccccccccccccccccccccc"
const CHECKOUT = "dddddddddddddddddddddddd"
const USER = "eeeeeeeeeeeeeeeeeeeeeeee"
const CHANGE = "ffffffffffffffffffffffff"

const context = { principal: { _id: "user-1", restrictedToProjectIds: [PROJECT] }, projectId: PROJECT } as unknown as McpToolContext
const toolNamed = (name: string) => ASSISTANT_TOOLS.find(tool => tool.name === name)!

const checkout = (version: string, url = "https://cdn.example.com/checkout") => ({ _id: CHECKOUT, slug: "checkout", name: "Checkout", version, host: { type: "CUSTOM_URL", url } })

describe("describeServedChanges", () => {
    it("Given two configurations, when compared, then versions, hosts and variables that differ are listed, and nothing else", () => {
        const changes = describeServedChanges(
            {
                microfrontends: [checkout("1.0.0"), { slug: "cart", name: "Cart", version: "2.0.0" }, { slug: "legacy", name: "Legacy", version: "0.1.0" }],
                variables: [
                    { key: "API_URL", value: "https://old" },
                    { key: "THEME", value: "dark" },
                    { key: "OLD_FLAG", value: "1" }
                ]
            },
            {
                microfrontends: [checkout("1.1.0", "https://cdn2.example.com/checkout"), { slug: "cart", name: "Cart", version: "2.0.0" }, { slug: "search", name: "Search", version: "0.0.1" }],
                variables: [
                    { key: "API_URL", value: "https://new" },
                    { key: "THEME", value: "dark" },
                    { key: "NEW_FLAG", value: "on" }
                ]
            }
        )

        expect(changes).toEqual([
            "Checkout: 1.0.0 → 1.1.0",
            "Checkout: https://cdn.example.com/checkout → https://cdn2.example.com/checkout",
            "+ Search 0.0.1 (?)",
            "− Legacy",
            "API_URL: https://old → https://new",
            "+ NEW_FLAG = on",
            "− OLD_FLAG"
        ])
    })
})

describe("describeConfirmation", () => {
    beforeEach(() => {
        for (const mock of [environments, environmentById, microfrontends, deploymentsOf, deploymentById, variablesOf, projectById, projectUsers, aiChange]) mock.mockReset()
        projectById.mockResolvedValue({ name: "Shop" })
        environments.mockResolvedValue([
            { _id: PRODUCTION, name: "Production" },
            { _id: STAGING, name: "Staging" }
        ])
        microfrontends.mockResolvedValue([checkout("1.1.0")])
    })

    it("Given a deploy, when described, then each environment says what changes compared to what it serves now, or all it will serve when it was never deployed", async () => {
        deploymentsOf.mockImplementation(async (environmentId: string) =>
            environmentId === PRODUCTION
                ? [
                      { _id: "d2", deploymentId: "#2", active: true, microfrontends: [checkout("1.0.0")], variables: [{ key: "API_URL", value: "https://api" }] },
                      { _id: "d1", deploymentId: "#1", active: false, microfrontends: [], variables: [] }
                  ]
                : []
        )
        variablesOf.mockResolvedValue([{ key: "API_URL", value: "https://api" }])

        const details = await describeConfirmation(toolNamed("deploy"), { environmentIds: [PRODUCTION, STAGING] }, context)

        expect(details).toEqual([
            { label: "project", value: "Shop" },
            { label: "environment", value: "Production" },
            { label: "changes", value: "Checkout: 1.0.0 → 1.1.0" },
            { label: "environment", value: "Staging" },
            { label: "served", value: "Checkout 1.1.0 (https://cdn.example.com/checkout)\nAPI_URL = https://api" }
        ])
    })

    it("Given a deploy identical to what is served, when described, then it says there is no change", async () => {
        deploymentsOf.mockResolvedValue([{ _id: "d2", deploymentId: "#2", active: true, microfrontends: [checkout("1.1.0")], variables: [] }])
        variablesOf.mockResolvedValue([])

        const details = await describeConfirmation(toolNamed("deploy"), { environmentIds: [PRODUCTION] }, context)

        expect(details).toContainEqual({ label: "no_changes", value: "#2" })
    })

    it("Given a role change, when described, then the user is named by name and email and the role is shown as sent", async () => {
        projectUsers.mockResolvedValue([{ _id: USER, name: "Ada", surname: "Lovelace", email: "ada@example.com" }])

        const details = await describeConfirmation(toolNamed("project_member_role_set"), { userId: USER, role: "OWNER" }, context)

        expect(details).toEqual([
            { label: "project", value: "Shop" },
            { label: "user", value: "Ada Lovelace <ada@example.com>" },
            { label: "role", value: "OWNER" }
        ])
    })

    it("Given lookups that fail or find nothing, when described, then the raw values are shown and the card is still built", async () => {
        projectById.mockRejectedValue(new Error("boom"))
        environments.mockRejectedValue(new Error("boom"))

        const details = await describeConfirmation(toolNamed("environments_delete_bulk"), { environmentIds: [PRODUCTION, STAGING] }, context)

        expect(details).toEqual([
            { label: "project", value: PROJECT },
            { label: "environments", value: `${PRODUCTION}\n${STAGING}` }
        ])
    })

    it("Given an AI change, when described, then its microfrontend, a summary of the prompt and the files it would write are shown, minus the excluded ones", async () => {
        aiChange.mockResolvedValue({
            microfrontendId: CHECKOUT,
            prompt: `Add a coupon field ${"x".repeat(300)}`,
            files: [
                { path: "src/Coupon.tsx", action: "create" },
                { path: "src/secret.ts", action: "update" }
            ]
        })

        const details = await describeConfirmation(toolNamed("ai_change_apply"), { changeId: CHANGE, excludePaths: ["src/secret.ts"] }, context)

        expect(details[1]).toEqual({ label: "microfrontend", value: "Checkout 1.1.0 (https://cdn.example.com/checkout)" })
        expect(details[2].label).toBe("prompt")
        expect(details[2].value.startsWith("Add a coupon field")).toBe(true)
        expect(details[2].value.length).toBeLessThanOrEqual(201)
        expect(details[3]).toEqual({ label: "files", value: "create src/Coupon.tsx" })
        expect(details[4]).toEqual({ label: "excludePaths", value: "src/secret.ts" })
    })

    it("Given a rollback, when described, then the deployment coming back and what it changes are shown", async () => {
        deploymentById.mockResolvedValue({ _id: "d1", environmentId: PRODUCTION, deploymentId: "#1", deployedAt: new Date("2026-10-01T10:00:00Z"), microfrontends: [checkout("1.0.0")], variables: [] })
        environmentById.mockResolvedValue({ name: "Production" })
        deploymentsOf.mockResolvedValue([{ _id: "d2", deploymentId: "#2", active: true, microfrontends: [checkout("1.1.0")], variables: [] }])

        const details = await describeConfirmation(toolNamed("deployment_rollback"), { deploymentId: "123456789012345678901234" }, context)

        expect(details).toEqual([
            { label: "project", value: "Shop" },
            { label: "environment", value: "Production" },
            { label: "deployment", value: "#1 (2026-10-01 10:00)" },
            { label: "changes", value: "Checkout: 1.1.0 → 1.0.0" }
        ])
    })
})
