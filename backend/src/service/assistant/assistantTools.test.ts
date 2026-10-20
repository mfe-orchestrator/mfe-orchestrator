import { beforeEach, describe, expect, it, vi } from "vitest"
import { McpToolContext } from "../../mcp/toolDefinition"
import { assistantOnlyTools, redactSecrets } from "./assistantTools"

const getFailedRunLogs = vi.fn()

vi.mock("../BuildStatusService", () => ({
    default: class {
        getFailedRunLogs = getFailedRunLogs
    }
}))

const MICROFRONTEND = "aaaaaaaaaaaaaaaaaaaaaaaa"
const SERVICE = "bbbbbbbbbbbbbbbbbbbbbbbb"
const context = { principal: { _id: "user-1" }, projectId: "project-1" } as unknown as McpToolContext
const toolNamed = (name: string) => assistantOnlyTools.find(tool => tool.name === name)!

describe("assistant-only tools", () => {
    beforeEach(() => {
        getFailedRunLogs.mockReset()
    })

    it("Given the tools MCP lacks, when read, then they are console-only reads", () => {
        for (const tool of assistantOnlyTools) {
            expect(tool.consoleOnly, tool.name).toBe(true)
            expect(tool.scope, tool.name).toBe("mfe:read")
            expect(tool.annotations.readOnlyHint, tool.name).toBe(true)
        }
    })

    it("Given failed CI jobs echoing credentials, when their logs are read, then the secrets are blanked before anything is returned", async () => {
        getFailedRunLogs.mockResolvedValue([{ name: "build", log: "export GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz0123456789\nERROR: lint failed" }])

        const result = (await toolNamed("get_failed_build_logs").run({ microfrontendId: MICROFRONTEND, runId: "42" } as never, context)) as { job: string; truncated: boolean; log: string }[]

        expect(getFailedRunLogs).toHaveBeenCalledWith("project-1", { microfrontendId: MICROFRONTEND }, "42")
        expect(result[0]).toMatchObject({ job: "build", truncated: false })
        expect(result[0].log).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123456789")
        expect(result[0].log).toContain("ERROR: lint failed")
    })

    it("Given a long log, when read, then only its end is kept, where the error usually is", async () => {
        getFailedRunLogs.mockResolvedValue([{ name: "build", log: `${"x".repeat(20_000)}ERROR at the end` }])

        const result = (await toolNamed("get_failed_build_logs").run({ microfrontendId: MICROFRONTEND, runId: "42" } as never, context)) as { truncated: boolean; log: string }[]

        expect(result[0].truncated).toBe(true)
        expect(result[0].log.length).toBe(15_000)
        expect(result[0].log.endsWith("ERROR at the end")).toBe(true)
    })

    it("Given a log request without a run id, when validated, then the input is refused", () => {
        expect(toolNamed("get_failed_build_logs").inputSchema.safeParse({ microfrontendId: MICROFRONTEND }).success).toBe(false)
    })

    it("Given a failed backend build, when its logs are read, then the run is looked up on the service", async () => {
        getFailedRunLogs.mockResolvedValue([])

        await toolNamed("get_failed_build_logs").run({ serviceId: SERVICE, runId: "42" } as never, context)

        expect(getFailedRunLogs).toHaveBeenCalledWith("project-1", { serviceId: SERVICE }, "42")
    })

    it("Given a log request naming both a microfrontend and a service, or neither, when validated, then the input is refused", () => {
        const schema = toolNamed("get_failed_build_logs").inputSchema
        expect(schema.safeParse({ microfrontendId: MICROFRONTEND, serviceId: SERVICE, runId: "42" }).success).toBe(false)
        expect(schema.safeParse({ runId: "42" }).success).toBe(false)
    })

    it("Given a question about the platform, when the docs are searched, then sections come back with their URL", async () => {
        const sections = (await toolNamed("search_docs").run({ query: "canary release" } as never, context)) as { url: string }[]

        expect(sections.length).toBeGreaterThan(0)
        expect(sections[0].url).toMatch(/^https?:\/\//)
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

    it("Given variables, bearer tokens, private keys and Azure storage credentials in a log, when redacted, then each value is blanked and the names stay", () => {
        const log = [
            "AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
            "NPM_TOKEN: abc123def456",
            "DB_PASSWD=hunter2",
            "MY_PWD = pa55",
            "curl -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload'",
            "-----BEGIN RSA PRIVATE KEY-----",
            "MIIEowIBAAKCAQEAtopsecretkeymaterial",
            "-----END RSA PRIVATE KEY-----",
            "DefaultEndpointsProtocol=https;AccountName=acme;AccountKey=Zm9vYmFyYmF6PT0=;EndpointSuffix=core.windows.net",
            "Endpoint=sb://acme.servicebus.windows.net/;SharedAccessSignature=SharedAccessSignature sr=x",
            "GET https://acme.blob.core.windows.net/c/app.js?sv=2024-01-01&sig=AbCdEf%2B123&se=2026",
            "Build finished in 12s"
        ].join("\n")

        const redacted = redactSecrets(log)

        for (const secret of ["wJalrXUtnFEMI", "abc123def456", "hunter2", "pa55", "eyJhbGciOiJIUzI1NiJ9", "topsecretkeymaterial", "Zm9vYmFyYmF6PT0", "AbCdEf%2B123"]) {
            expect(redacted).not.toContain(secret)
        }
        expect(redacted).toContain("AWS_SECRET_ACCESS_KEY=[REDACTED]")
        expect(redacted).toContain("NPM_TOKEN: [REDACTED]")
        expect(redacted).toContain("Bearer [REDACTED]")
        expect(redacted).toContain("[REDACTED PRIVATE KEY]")
        expect(redacted).toContain("AccountName=acme;AccountKey=[REDACTED];EndpointSuffix")
        expect(redacted).toContain("SharedAccessSignature=[REDACTED]")
        expect(redacted).toContain("&sig=[REDACTED]&se=2026")
        expect(redacted).toContain("Build finished in 12s")
    })
})
