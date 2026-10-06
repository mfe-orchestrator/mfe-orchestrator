import { beforeEach, describe, expect, it, vi } from "vitest"
import { IUser } from "../../models/UserModel"
import { redactSecrets, runAssistantTool } from "./assistantTools"

const getByEnvironmentId = vi.fn()
const getEnvironmentById = vi.fn()

vi.mock("../EnvironmentService", () => ({
    default: class {
        getById = getEnvironmentById
    }
}))

vi.mock("../DeploymentService", () => ({
    default: class {
        getByEnvironmentId = getByEnvironmentId
    }
}))

const context = { user: { _id: "user-1" } as unknown as IUser, projectId: "project-1" }

const toolUse = (name: string, input: unknown) => ({ type: "tool_use" as const, id: "toolu_1", name, input, caller: undefined }) as never

describe("runAssistantTool", () => {
    beforeEach(() => {
        getByEnvironmentId.mockReset()
        getEnvironmentById.mockReset().mockResolvedValue({ _id: "env-1", projectId: "project-1" })
    })

    it("Given an environment id of another project, when deployments are listed, then nothing of that project is read", async () => {
        getEnvironmentById.mockResolvedValue({ _id: "env-9", projectId: "project-2" })

        const result = await runAssistantTool(toolUse("list_deployments", { environment_id: "env-9" }), context)

        expect(result.is_error).toBe(true)
        expect(getByEnvironmentId).not.toHaveBeenCalled()
    })

    it("Given a tool the assistant does not have, when it is called, then an error result is returned", async () => {
        const result = await runAssistantTool(toolUse("delete_everything", {}), context)

        expect(result.is_error).toBe(true)
        expect(result.tool_use_id).toBe("toolu_1")
    })

    it("Given a missing required argument, when the tool is called, then an error result names the argument", async () => {
        const result = await runAssistantTool(toolUse("list_deployments", {}), context)

        expect(result.is_error).toBe(true)
        expect(result.content).toContain("environment_id")
        expect(getByEnvironmentId).not.toHaveBeenCalled()
    })

    it("Given deployments carrying storages, when they are listed, then credentials never reach the model and only variable keys do", async () => {
        getByEnvironmentId.mockResolvedValue([
            {
                _id: "dep-2",
                deploymentId: "d2",
                active: true,
                deployedAt: "2026-10-01T10:00:00.000Z",
                microfrontends: [{ _id: "mfe-1", name: "Checkout", slug: "checkout", version: "1.2.0" }],
                variables: [{ key: "API_URL", value: "https://secret.example" }],
                storages: [{ authConfig: { secretAccessKey: "s3-secret" } }]
            },
            { _id: "dep-1", deploymentId: "d1", active: false, deployedAt: "2026-09-01T10:00:00.000Z" }
        ])

        const result = await runAssistantTool(toolUse("list_deployments", { environment_id: "env-1", limit: 1 }), context)

        expect(result.is_error).toBeUndefined()
        const content = result.content as string
        expect(content).not.toContain("s3-secret")
        expect(content).not.toContain("https://secret.example")
        expect(JSON.parse(content)).toEqual([
            {
                id: "dep-2",
                deploymentId: "d2",
                active: true,
                deployedAt: "2026-10-01T10:00:00.000Z",
                microfrontends: [{ id: "mfe-1", name: "Checkout", slug: "checkout", version: "1.2.0" }],
                variableKeys: ["API_URL"]
            }
        ])
    })

    it("Given a service that throws, when the tool is called, then the failure becomes an error result instead of aborting the turn", async () => {
        getByEnvironmentId.mockRejectedValue(new Error("User cannot access this environment"))

        const result = await runAssistantTool(toolUse("list_deployments", { environment_id: "env-1" }), context)

        expect(result.is_error).toBe(true)
        expect(result.content).toBe("User cannot access this environment")
    })
})

describe("redactSecrets", () => {
    it("Given a CI log echoing credentials, when redacted, then tokens and passwords are blanked and the rest is kept", () => {
        const log = [
            "git clone https://ci-user:s3cr3tpass@github.com/acme/app.git",
            "export GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz0123456789",
            "//registry.npmjs.org/:_authToken=npm_abcdefghijklmnopqrstuvwxyz0123456789",
            "aws key AKIAABCDEFGHIJKLMNOP",
            "ERROR in src/main.ts: Cannot find module './app'"
        ].join("\n")

        const redacted = redactSecrets(log)

        for (const secret of ["s3cr3tpass", "ghp_abcdefghijklmnopqrstuvwxyz0123456789", "npm_abcdefghijklmnopqrstuvwxyz0123456789", "AKIAABCDEFGHIJKLMNOP"]) {
            expect(redacted).not.toContain(secret)
        }
        expect(redacted).toContain("ERROR in src/main.ts: Cannot find module './app'")
        expect(redacted).toContain("github.com/acme/app.git")
    })
})
