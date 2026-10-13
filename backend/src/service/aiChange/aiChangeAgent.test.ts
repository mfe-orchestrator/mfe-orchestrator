import { execFileSync, spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { LlmClient, LlmProvider, LlmTurnRequest, LlmTurnResult } from "../llm"
import { GitWorkingCopy } from "../workspace/GitWorkingCopy"
import { AI_CHANGE_LIMITS, AiChangeToolbox, runAiChangeAgent } from "./aiChangeAgent"

const hasGit = spawnSync("git", ["--version"]).status === 0

/** A committed repository on disk: the toolbox only needs the tracked files, no remote. */
const makeRepository = (files: Record<string, string>) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-change-agent-"))
    for (const [file, content] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
        fs.writeFileSync(path.join(dir, file), content)
    }
    const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" }
    execFileSync("git", ["init", "--initial-branch=main"], { cwd: dir, env })
    execFileSync("git", ["add", "."], { cwd: dir, env })
    execFileSync("git", ["commit", "-m", "init"], { cwd: dir, env })
    return dir
}

describe.skipIf(!hasGit)("AiChangeToolbox", () => {
    let dir: string
    let toolbox: AiChangeToolbox

    beforeEach(() => {
        dir = makeRepository({
            "src/App.tsx": "export const App = () => <Checkout />\n",
            "src/Checkout.tsx": "export const Checkout = () => null\n",
            ".env": "API_TOKEN=do-not-read\n",
            ".github/workflows/build.yml": "on: push\n",
            "README.md": "# shop\n"
        })
        fs.writeFileSync(path.join(os.tmpdir(), "outside-the-repo.txt"), "other tenant")
        fs.symlinkSync(path.join(os.tmpdir(), "outside-the-repo.txt"), path.join(dir, "escape"))
        toolbox = new AiChangeToolbox(new GitWorkingCopy(dir, "http://unused", { username: "", password: "" }))
    })

    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

    it("Given a folder, when the files are listed, then only those under it come back", async () => {
        expect(await toolbox.run("list_files", { prefix: "src" })).toBe("src/App.tsx\nsrc/Checkout.tsx")
    })

    it("Given a text to look for, when it is searched, then the matching lines come back with their position", async () => {
        expect(await toolbox.run("search", { text: "checkout" })).toBe("src/App.tsx:1: export const App = () => <Checkout />\nsrc/Checkout.tsx:1: export const Checkout = () => null")
    })

    it("Given a search, then files holding credentials are not searched", async () => {
        expect(await toolbox.run("search", { text: "API_TOKEN" })).toBe("No matches.")
    })

    it("Given a .env file, when it is read, then it is refused", async () => {
        await expect(toolbox.run("read_file", { path: ".env" })).rejects.toThrow(/credentials/)
    })

    it("Given a symlink out of the repository, when it is read, then it is refused", async () => {
        await expect(toolbox.run("read_file", { path: "escape" })).rejects.toThrow(/outside the repository/)
    })

    it("Given a path climbing out, when it is written, then nothing is written outside", async () => {
        await expect(toolbox.run("write_file", { path: "../pwned.txt", content: "x" })).rejects.toThrow(/outside the repository/)
        expect(fs.existsSync(path.join(path.dirname(dir), "pwned.txt"))).toBe(false)
    })

    it("Given a CI workflow, when it is written, then it is refused", async () => {
        await expect(toolbox.run("write_file", { path: ".github/workflows/build.yml", content: "on: pull_request\n" })).rejects.toThrow(/CI configuration/)
        expect(fs.readFileSync(path.join(dir, ".github/workflows/build.yml"), "utf8")).toBe("on: push\n")
    })

    it("Given a new file, when it is written and read back, then the agent sees its own edit", async () => {
        await toolbox.run("write_file", { path: "src/pages/NotFound.tsx", content: "export const NotFound = () => null\n" })

        expect(await toolbox.run("read_file", { path: "src/pages/NotFound.tsx" })).toBe("export const NotFound = () => null\n")
    })

    it("Given the file limit reached, when one more file is written, then it is refused but the same files can still be edited", async () => {
        for (let index = 0; index < AI_CHANGE_LIMITS.maxChangedFiles; index++) {
            await toolbox.run("write_file", { path: `src/generated/file-${index}.ts`, content: "x" })
        }

        await expect(toolbox.run("write_file", { path: "src/one-more.ts", content: "x" })).rejects.toThrow(/At most/)
        await expect(toolbox.run("write_file", { path: "src/generated/file-0.ts", content: "y" })).resolves.toMatch(/Updated/)
    })

    it("Given a symlinked folder pointing at the workflows, when a file is written through it, then it is refused", async () => {
        fs.symlinkSync(".github/workflows", path.join(dir, "ci"))

        await expect(toolbox.run("write_file", { path: "ci/deploy.yml", content: "on: push\n" })).rejects.toThrow(/CI configuration/)
        expect(fs.existsSync(path.join(dir, ".github/workflows/deploy.yml"))).toBe(false)
    })

    it("Given a symlink to .git, when the agent writes the git config through it, then it is refused", async () => {
        fs.symlinkSync(".git", path.join(dir, "g"))
        const before = fs.readFileSync(path.join(dir, ".git", "config"), "utf8")

        await expect(toolbox.run("write_file", { path: "g/config", content: "[http]\n\tcorsProxy = https://evil.example\n" })).rejects.toThrow(/\.git/)
        expect(fs.readFileSync(path.join(dir, ".git", "config"), "utf8")).toBe(before)
    })

    it("Given a symlink to .env, when it is read, then it is refused", async () => {
        fs.symlinkSync(".env", path.join(dir, "settings.txt"))

        await expect(toolbox.run("read_file", { path: "settings.txt" })).rejects.toThrow(/credentials/)
    })

    it("Given a path .gitignore excludes, when it is written, then it is refused", async () => {
        fs.writeFileSync(path.join(dir, ".gitignore"), "dist\n")

        await expect(toolbox.run("write_file", { path: "dist/bundle.js", content: "x" })).rejects.toThrow(/ignored/)
    })

    it("Given finish, when it is called, then the summary is kept", async () => {
        await toolbox.run("finish", { summary: "Added a 404 page" })

        expect(toolbox.summary).toBe("Added a 404 page")
    })
})

/** A model that answers with the scripted turns in order, and records what it was sent. */
const scriptedClient = (turns: Pick<LlmTurnResult, "stopReason" | "text" | "toolCalls">[]) => {
    const sent: LlmTurnRequest[] = []
    const client: LlmClient = {
        provider: LlmProvider.ANTHROPIC,
        json: async () => null,
        turn: async request => {
            sent.push(structuredClone({ ...request, signal: undefined }))
            const next = turns.shift()
            if (!next) throw new Error("No scripted turn left")
            return { ...next, usage: { inputTokens: 10, outputTokens: 5 }, message: { role: "assistant", text: next.text, toolCalls: next.toolCalls } }
        }
    }
    return { client, sent }
}

const toolUse = (id: string, name: string, input: Record<string, unknown>) => ({ id, name, input })

describe.skipIf(!hasGit)("runAiChangeAgent", () => {
    let dir: string
    let workingCopy: GitWorkingCopy
    const input = {
        prompt: "Add a 404 page",
        baseBranch: "main",
        project: { name: "Shop", context: "We use TypeScript strict." },
        microfrontend: { name: "Catalog", slug: "catalog", framework: "REACT", context: "Pages live in src/pages." }
    }
    const hooks = () => {
        const events: string[] = []
        let tokens = 0
        return {
            events,
            tokens: () => tokens,
            hooks: { onEvent: (_kind: string, message: string) => void events.push(message), onUsage: ({ inputTokens }: { inputTokens: number }) => void (tokens += inputTokens) }
        }
    }

    beforeEach(() => {
        dir = makeRepository({ "src/App.tsx": "export const App = () => null\n" })
        workingCopy = new GitWorkingCopy(dir, "http://unused", { username: "", password: "" })
    })

    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

    it("Given an agent that writes a file then finishes, when it runs, then the working copy holds the change and the summary comes back", async () => {
        const { client, sent } = scriptedClient([
            { stopReason: "tool_use", text: "", toolCalls: [toolUse("1", "write_file", { path: "src/pages/NotFound.tsx", content: "export const NotFound = () => null\n" })] },
            { stopReason: "tool_use", text: "", toolCalls: [toolUse("2", "finish", { summary: "Added src/pages/NotFound.tsx" })] }
        ])
        const { events, tokens, hooks: agentHooks } = hooks()

        const result = await runAiChangeAgent(client, workingCopy, input, agentHooks)

        expect(result).toEqual({ summary: "Added src/pages/NotFound.tsx", stopReason: "finished" })
        expect((await workingCopy.changes()).map(change => change.path)).toEqual(["src/pages/NotFound.tsx"])
        expect(events).toEqual(["write_file src/pages/NotFound.tsx", "finish"])
        expect(tokens()).toBe(20)
        const firstMessage = sent[0].messages[0]
        const firstPrompt = firstMessage.role === "user" ? firstMessage.text : ""
        expect(firstPrompt).toContain("We use TypeScript strict.")
        expect(firstPrompt).toContain("Pages live in src/pages.")
        expect(firstPrompt).toContain("<request>\nAdd a 404 page\n</request>")
    })

    it("Given a tool call that fails, when it runs, then the error goes back to the model as a tool result and the run goes on", async () => {
        const { client, sent } = scriptedClient([
            { stopReason: "tool_use", text: "", toolCalls: [toolUse("1", "read_file", { path: "../../etc/passwd" })] },
            { stopReason: "end_turn", text: "Nothing to do.", toolCalls: [] }
        ])

        const result = await runAiChangeAgent(client, workingCopy, input, hooks().hooks)

        expect(result.stopReason).toBe("end_turn")
        const toolMessage = sent[1].messages[2]
        expect(toolMessage.role === "tool" && toolMessage.results[0]).toMatchObject({ callId: "1", isError: true })
    })

    it("Given a write cut off by max_tokens, when it runs, then the write is not executed", async () => {
        const { client } = scriptedClient([{ stopReason: "max_tokens", text: "", toolCalls: [toolUse("1", "write_file", { path: "src/App.tsx", content: "export const App = (" })] }])

        const result = await runAiChangeAgent(client, workingCopy, input, hooks().hooks)

        expect(result.stopReason).toBe("max_tokens")
        expect(await workingCopy.changes()).toEqual([])
    })
})
