import { execFileSync, spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LlmClient, LlmProvider, LlmTurnRequest, LlmTurnResult } from "../llm"
import { GitWorkingCopy } from "../workspace/GitWorkingCopy"
import { AI_CHANGE_LIMITS, AiChangeToolbox, agentLimitsFor, runAiChangeAgent } from "./aiChangeAgent"

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
        toolbox = new AiChangeToolbox([{ slug: "shop", workingCopy: new GitWorkingCopy(dir, "http://unused", { username: "", password: "" }) }])
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

    it("Given a snippet found once, when the file is edited, then only that snippet changes", async () => {
        await expect(toolbox.run("edit_file", { path: "src/Checkout.tsx", old_text: "() => null", new_text: "() => <form />" })).resolves.toBe("Edited src/Checkout.tsx.")

        expect(await toolbox.run("read_file", { path: "src/Checkout.tsx" })).toBe("export const Checkout = () => <form />\n")
    })

    it("Given a replacement holding $ patterns, when the file is edited, then it is written literally", async () => {
        await toolbox.run("edit_file", { path: "README.md", old_text: "shop", new_text: "$& costs $1" })

        expect(await toolbox.run("read_file", { path: "README.md" })).toBe("# $& costs $1\n")
    })

    it("Given a snippet missing or found twice, when the file is edited, then it is refused and the file is untouched", async () => {
        fs.writeFileSync(path.join(dir, "src/App.tsx"), "a()\na()\n")

        await expect(toolbox.run("edit_file", { path: "src/App.tsx", old_text: "b()", new_text: "c()" })).rejects.toThrow(/not found/)
        await expect(toolbox.run("edit_file", { path: "src/App.tsx", old_text: "a()", new_text: "c()" })).rejects.toThrow(/more than once/)
        expect(fs.readFileSync(path.join(dir, "src/App.tsx"), "utf8")).toBe("a()\na()\n")
    })

    it("Given a file that does not exist, when it is edited, then it is refused", async () => {
        await expect(toolbox.run("edit_file", { path: "src/Missing.tsx", old_text: "a", new_text: "b" })).rejects.toThrow(/does not exist/)
    })

    it("Given a .env file, a CI workflow or a path climbing out, when it is edited, then it is refused", async () => {
        await expect(toolbox.run("edit_file", { path: ".env", old_text: "API_TOKEN", new_text: "X" })).rejects.toThrow(/credentials/)
        await expect(toolbox.run("edit_file", { path: ".github/workflows/build.yml", old_text: "push", new_text: "pull_request" })).rejects.toThrow(/CI configuration/)
        await expect(toolbox.run("edit_file", { path: "../pwned.txt", old_text: "a", new_text: "b" })).rejects.toThrow(/outside the repository/)
        expect(fs.readFileSync(path.join(dir, ".env"), "utf8")).toBe("API_TOKEN=do-not-read\n")
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

describe("agentLimitsFor", () => {
    it("Given more repositories, then rounds and written bytes grow with them up to their ceiling", () => {
        expect(agentLimitsFor(1)).toEqual({ maxRounds: 40, maxWrittenBytes: 500_000 })
        expect(agentLimitsFor(2)).toEqual({ maxRounds: 60, maxWrittenBytes: 1_000_000 })
        expect(agentLimitsFor(10)).toEqual({ maxRounds: 120, maxWrittenBytes: 2_000_000 })
    })
})

describe.skipIf(!hasGit)("AiChangeToolbox on several repositories", () => {
    let catalog: string
    let cart: string
    let toolbox: AiChangeToolbox

    beforeEach(() => {
        catalog = makeRepository({ "src/price.ts": "export const formatPrice = (value: number) => `${value}`\n", "README.md": "# catalog\n" })
        cart = makeRepository({ "src/Cart.tsx": "import { formatPrice } from '@shop/catalog'\n", ".env": "formatPrice=secret\n" })
        const workingCopy = (dir: string) => new GitWorkingCopy(dir, "http://unused", { username: "", password: "" })
        toolbox = new AiChangeToolbox([
            { slug: "catalog", workingCopy: workingCopy(catalog) },
            { slug: "cart", workingCopy: workingCopy(cart) }
        ])
    })

    afterEach(() => {
        fs.rmSync(catalog, { recursive: true, force: true })
        fs.rmSync(cart, { recursive: true, force: true })
    })

    it("Given no prefix, when the files are listed, then the repositories are listed", async () => {
        expect(await toolbox.run("list_files", {})).toBe('catalog/ (2 files)\ncart/ (2 files)\nList one with prefix, e.g. "catalog/src".')
    })

    it("Given a repository folder, when the files are listed, then its files come back under its slug", async () => {
        expect(await toolbox.run("list_files", { prefix: "cart/src" })).toBe("cart/src/Cart.tsx")
        expect(await toolbox.run("list_files", { prefix: "catalog" })).toBe("catalog/README.md\ncatalog/src/price.ts")
    })

    it("Given a text used in two repositories, when it is searched, then both match under their slug and secrets stay out", async () => {
        expect(await toolbox.run("search", { text: "formatPrice" })).toBe(
            "catalog/src/price.ts:1: export const formatPrice = (value: number) => `${value}`\ncart/src/Cart.tsx:1: import { formatPrice } from '@shop/catalog'"
        )
        expect(await toolbox.run("search", { text: "formatPrice", prefix: "cart" })).toBe("cart/src/Cart.tsx:1: import { formatPrice } from '@shop/catalog'")
    })

    it("Given a path under a slug, when it is written and read back, then it lands in that repository only", async () => {
        await expect(toolbox.run("write_file", { path: "cart/src/Total.tsx", content: "export const Total = () => null\n" })).resolves.toBe("Created cart/src/Total.tsx.")

        expect(fs.existsSync(path.join(cart, "src/Total.tsx"))).toBe(true)
        expect(fs.existsSync(path.join(catalog, "src/Total.tsx"))).toBe(false)
        expect(await toolbox.run("read_file", { path: "cart/src/Total.tsx" })).toBe("export const Total = () => null\n")
    })

    it("Given a path without a known slug, when it is read, then it is refused", async () => {
        await expect(toolbox.run("read_file", { path: "src/Cart.tsx" })).rejects.toThrow(/slug of a repository: catalog, cart/)
    })

    it("Given a slug followed by a climb, when it is written, then nothing is written in the other repository", async () => {
        await expect(toolbox.run("write_file", { path: `catalog/../${path.basename(cart)}/src/x.ts`, content: "x" })).rejects.toThrow(/outside the repository/)
    })

    it("Given the file limit reached in one repository, when the other is written, then it is still allowed", async () => {
        for (let index = 0; index < AI_CHANGE_LIMITS.maxChangedFiles; index++) {
            await toolbox.run("write_file", { path: `catalog/src/generated/file-${index}.ts`, content: "x" })
        }

        await expect(toolbox.run("write_file", { path: "catalog/src/one-more.ts", content: "x" })).rejects.toThrow(/At most/)
        await expect(toolbox.run("write_file", { path: "cart/src/one-more.ts", content: "x" })).resolves.toMatch(/Created/)
    })

    it("Given a follow-up whose parent changed as many files as allowed, when a new file is written, then it is refused but the parent's files can still be edited", async () => {
        const previousChanges = Array.from({ length: AI_CHANGE_LIMITS.maxChangedFiles }, (_, index) => ({ path: `src/generated/file-${index}.ts`, bytes: 10 }))
        const seeded = new AiChangeToolbox([{ slug: "catalog", workingCopy: new GitWorkingCopy(catalog, "http://unused", { username: "", password: "" }), previousChanges }])

        await expect(seeded.run("write_file", { path: "src/one-more.ts", content: "x" })).rejects.toThrow(/At most/)
        await expect(seeded.run("write_file", { path: "src/generated/file-0.ts", content: "y" })).resolves.toMatch(/Created/)
    })

    it("Given a follow-up whose parent wrote most of the byte budget, when more is written, then the parent's bytes count", async () => {
        const seeded = new AiChangeToolbox([
            { slug: "catalog", workingCopy: new GitWorkingCopy(catalog, "http://unused", { username: "", password: "" }), previousChanges: [{ path: "a.ts", bytes: 450_000 }] }
        ])

        await expect(seeded.run("write_file", { path: "b.ts", content: "x".repeat(60_000) })).rejects.toThrow(/500000 bytes/)
    })

    it("Given two repositories, when more than their byte budget is written, then it is refused", async () => {
        const chunk = "x".repeat(400_000)
        for (const file of ["catalog/a.ts", "catalog/b.ts"]) await toolbox.run("write_file", { path: file, content: chunk })

        await expect(toolbox.run("write_file", { path: "cart/c.ts", content: chunk })).rejects.toThrow(/1000000 bytes/)
    })
})

/** A model that answers with the scripted turns in order, and records what it was sent. */
const scriptedClient = (turns: Pick<LlmTurnResult, "stopReason" | "text" | "toolCalls" | "thinking">[]) => {
    const sent: LlmTurnRequest[] = []
    const client: LlmClient = {
        provider: LlmProvider.ANTHROPIC,
        json: async () => null,
        turn: async request => {
            sent.push(structuredClone({ ...request, signal: undefined }))
            const next = turns.shift()
            if (!next) throw new Error("No scripted turn left")
            return { ...next, usage: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 5 }, message: { role: "assistant", text: next.text, toolCalls: next.toolCalls } }
        }
    }
    return { client, sent }
}

const toolUse = (id: string, name: string, input: Record<string, unknown>) => ({ id, name, input })

describe.skipIf(!hasGit)("runAiChangeAgent", () => {
    let dir: string
    let workingCopy: GitWorkingCopy
    const input = () => ({
        prompt: "Add a 404 page",
        project: { name: "Shop", context: "We use TypeScript strict." },
        repositories: [{ baseBranch: "main", workingCopy, microfrontend: { name: "Catalog", slug: "catalog", framework: "REACT", context: "Pages live in src/pages." } }]
    })
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

        const result = await runAiChangeAgent(client, input(), agentHooks)

        expect(result).toMatchObject({ summary: "Added src/pages/NotFound.tsx", stopReason: "finished" })
        expect((await workingCopy.changes()).map(change => change.path)).toEqual(["src/pages/NotFound.tsx"])
        expect(events).toEqual(["write_file src/pages/NotFound.tsx", "finish"])
        expect(tokens()).toBe(20)
        const firstMessage = sent[0].messages[0]
        const firstPrompt = firstMessage.role === "user" ? firstMessage.text : ""
        expect(firstPrompt).toContain("We use TypeScript strict.")
        expect(firstPrompt).toContain("Pages live in src/pages.")
        expect(firstPrompt).toContain("<request>\nAdd a 404 page\n</request>")
    })

    it("Given a chosen effort and a model that reasons, when it runs, then every turn is sent at that effort with its room, and each reasoning is logged before what the turn said and did", async () => {
        const { client, sent } = scriptedClient([
            {
                stopReason: "tool_use",
                thinking: "  The page goes in src/pages.  ",
                text: "Adding the page.",
                toolCalls: [toolUse("1", "write_file", { path: "src/pages/NotFound.tsx", content: "x\n" })]
            },
            { stopReason: "tool_use", thinking: "x".repeat(2_000), text: "", toolCalls: [toolUse("2", "finish", { summary: "Added the page" })] }
        ])
        const events: { kind: string; message: string }[] = []

        await runAiChangeAgent(client, { ...input(), effort: "xhigh" }, { onEvent: (kind, message) => void events.push({ kind, message }), onUsage: () => undefined })

        expect(sent.map(request => [request.effort, request.maxTokens])).toEqual([
            ["xhigh", 64_000],
            ["xhigh", 64_000]
        ])
        expect(events).toEqual([
            { kind: "thinking", message: "The page goes in src/pages." },
            { kind: "text", message: "Adding the page." },
            { kind: "tool", message: "write_file src/pages/NotFound.tsx" },
            { kind: "thinking", message: "x".repeat(1_000) },
            { kind: "tool", message: "finish" }
        ])
    })

    it("Given no effort, when it runs, then it reasons at high, as before the effort could be chosen", async () => {
        const { client, sent } = scriptedClient([{ stopReason: "end_turn", text: "Nothing to do.", toolCalls: [] }])

        await runAiChangeAgent(client, input(), hooks().hooks)

        expect(sent[0]).toMatchObject({ effort: "high", maxTokens: 32_000 })
    })

    it("Given a tool call that fails, when it runs, then the error goes back to the model as a tool result and the run goes on", async () => {
        const { client, sent } = scriptedClient([
            { stopReason: "tool_use", text: "", toolCalls: [toolUse("1", "read_file", { path: "../../etc/passwd" })] },
            { stopReason: "end_turn", text: "Nothing to do.", toolCalls: [] }
        ])

        const result = await runAiChangeAgent(client, input(), hooks().hooks)

        expect(result.stopReason).toBe("end_turn")
        const toolMessage = sent[1].messages[2]
        expect(toolMessage.role === "tool" && toolMessage.results[0]).toMatchObject({ callId: "1", isError: true })
    })

    it("Given a write cut off by max_tokens, when it runs, then the write is not executed", async () => {
        const { client } = scriptedClient([{ stopReason: "max_tokens", text: "", toolCalls: [toolUse("1", "write_file", { path: "src/App.tsx", content: "export const App = (" })] }])

        const result = await runAiChangeAgent(client, input(), hooks().hooks)

        expect(result.stopReason).toBe("max_tokens")
        expect(await workingCopy.changes()).toEqual([])
    })

    describe("on a provider that rate-limits", () => {
        const rateLimit = () => new Error("Your requests to gpt-6.1-sol for gpt-6.1-sol in northcentralus have exceeded token rate limit.")
        /** The scripted model behind a provider that rejects its first `times` turns. */
        const limited = (client: LlmClient, times: number, error = rateLimit): LlmClient => ({
            ...client,
            turn: async request => {
                if (times-- > 0) throw error()
                return client.turn(request)
            }
        })

        beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout"] }))
        afterEach(() => vi.useRealTimers())

        it("Given a turn rate-limited once, when it runs, then it says so, waits, and sends the same turn again", async () => {
            const { client, sent } = scriptedClient([
                { stopReason: "tool_use", text: "", toolCalls: [toolUse("1", "write_file", { path: "src/pages/NotFound.tsx", content: "export const NotFound = () => null\n" })] },
                { stopReason: "tool_use", text: "", toolCalls: [toolUse("2", "finish", { summary: "Added src/pages/NotFound.tsx" })] }
            ])
            const { events, hooks: agentHooks } = hooks()

            const running = runAiChangeAgent(limited(client, 1), input(), agentHooks)
            await vi.advanceTimersByTimeAsync(AI_CHANGE_LIMITS.rateLimitWaitsMs[0] - 1)
            expect(sent).toHaveLength(0)
            await vi.advanceTimersByTimeAsync(1)

            expect(await running).toMatchObject({ summary: "Added src/pages/NotFound.tsx", stopReason: "finished" })
            expect(events).toEqual(["rate-limited", "write_file src/pages/NotFound.tsx", "finish"])
            expect(sent).toHaveLength(2)
        })

        it("Given a turn rate-limited past every retry, when it runs, then the rate limit is thrown", async () => {
            const { client } = scriptedClient([])
            const { events, hooks: agentHooks } = hooks()

            const outcome = expect(runAiChangeAgent(limited(client, Number.POSITIVE_INFINITY), input(), agentHooks)).rejects.toThrow(/rate limit/)
            await vi.advanceTimersByTimeAsync(AI_CHANGE_LIMITS.rateLimitWaitsMs.reduce((total, wait) => total + wait, 0))

            await outcome
            expect(events.filter(message => message === "rate-limited")).toHaveLength(AI_CHANGE_LIMITS.rateLimitWaitsMs.length)
        })

        it("Given any other provider error, when it runs, then it is thrown at once", async () => {
            const failing = limited(scriptedClient([]).client, 1, () => new Error("server error"))
            const { events, hooks: agentHooks } = hooks()

            await expect(runAiChangeAgent(failing, input(), agentHooks)).rejects.toThrow("server error")
            expect(events).toEqual([])
        })
    })

    it("Given two repositories and an earlier request, when it runs, then the prompt lists both repositories and the chain, and paths start with a slug", async () => {
        const cartDir = makeRepository({ "src/Cart.tsx": "export const Cart = () => null\n" })
        try {
            const { client, sent } = scriptedClient([
                { stopReason: "tool_use", text: "", toolCalls: [toolUse("1", "write_file", { path: "cart/src/Cart.tsx", content: "export const Cart = () => 'cart'\n" })] },
                { stopReason: "tool_use", text: "", toolCalls: [toolUse("2", "finish", { summary: "Cart shows its name" })] }
            ])
            const twoRepositories = {
                ...input(),
                repositories: [
                    ...input().repositories,
                    { baseBranch: "develop", workingCopy: new GitWorkingCopy(cartDir, "http://unused", { username: "", password: "" }), microfrontend: { name: "Cart", slug: "cart" } }
                ],
                previousRequests: [{ prompt: "Add a cart page", summary: "Added src/Cart.tsx" }]
            }

            const result = await runAiChangeAgent(client, twoRepositories, hooks().hooks)

            expect(result).toMatchObject({ summary: "Cart shows its name", stopReason: "finished" })
            expect(fs.readFileSync(path.join(cartDir, "src/Cart.tsx"), "utf8")).toBe("export const Cart = () => 'cart'\n")
            expect(await workingCopy.changes()).toEqual([])
            const firstMessage = sent[0].messages[0]
            const firstPrompt = firstMessage.role === "user" ? firstMessage.text : ""
            expect(firstPrompt).toContain(
                "<repositories>\n<repository>\nname: Catalog\nslug: catalog\nframework: REACT\nbase_branch: main\n<microfrontend_context>\nPages live in src/pages.\n</microfrontend_context>\n</repository>"
            )
            expect(firstPrompt).toContain("<repository>\nname: Cart\nslug: cart\nbase_branch: develop\n</repository>\n</repositories>")
            expect(firstPrompt).toContain(
                "<previous_requests>\n<previous_request>\n<prompt>\nAdd a cart page\n</prompt>\n<summary>\nAdded src/Cart.tsx\n</summary>\n</previous_request>\n</previous_requests>"
            )
            expect(firstPrompt).toContain("summarise the WHOLE change")
            expect(sent[0].system).toContain("SEVERAL microfrontends")
        } finally {
            fs.rmSync(cartDir, { recursive: true, force: true })
        }
    })

    it("Given an agent that answers without a tool, when it runs, then the answer comes back with a transcript ending on it", async () => {
        const { client } = scriptedClient([{ stopReason: "end_turn", text: "The 404 page would go in src/pages.", toolCalls: [] }])

        const result = await runAiChangeAgent(client, input(), hooks().hooks)

        expect(result).toMatchObject({ summary: "The 404 page would go in src/pages.", stopReason: "end_turn" })
        expect(result.transcript.map(message => message.role)).toEqual(["user", "assistant"])
        expect(result.transcript.at(-1)).toEqual({ role: "assistant", text: "The 404 page would go in src/pages.", toolCalls: [] })
    })

    it("Given a run that ended with finish, when the next one carries on from its transcript, then the model gets the whole conversation and the new request after it", async () => {
        const first = scriptedClient([
            { stopReason: "tool_use", text: "", toolCalls: [toolUse("1", "read_file", { path: "src/App.tsx" })] },
            { stopReason: "tool_use", text: "", toolCalls: [toolUse("2", "finish", { summary: "Nothing needed" })] }
        ])
        const { transcript } = await runAiChangeAgent(first.client, input(), hooks().hooks)
        // The run ended on the result of finish: the model's last words close it.
        expect(transcript.map(message => message.role)).toEqual(["user", "assistant", "tool", "assistant", "tool", "assistant"])
        expect(transcript.at(-1)).toEqual({ role: "assistant", text: "Nothing needed", toolCalls: [] })

        const { client, sent } = scriptedClient([{ stopReason: "end_turn", text: "It renders null.", toolCalls: [] }])
        const result = await runAiChangeAgent(client, { ...input(), prompt: "What does App render?", history: transcript }, hooks().hooks)

        expect(sent[0].messages.slice(0, transcript.length)).toEqual(transcript)
        const next = sent[0].messages[transcript.length]
        expect(next.role === "user" && next.text).toContain("<request>\nWhat does App render?\n</request>")
        expect(next.role === "user" && next.text).not.toContain("<project_context")
        expect(result.transcript).toHaveLength(transcript.length + 2)
    })

    it.each([
        ["SINGLE_SPA", "integration: single-spa.", "import map"],
        ["MICRO_LC", "integration: micro-lc.", "window.ReactJSXRuntime"]
    ])("Given a %s microfrontend, then the prompt names the integration model and its shared React contract, not a bundler", async (compiler, model, contract) => {
        const { client, sent } = scriptedClient([{ stopReason: "end_turn", text: "Nothing to do.", toolCalls: [] }])
        const base = input()

        await runAiChangeAgent(client, { ...base, repositories: [{ ...base.repositories[0], microfrontend: { ...base.repositories[0].microfrontend, compiler } }] }, hooks().hooks)

        const firstMessage = sent[0].messages[0]
        const text = firstMessage.role === "user" ? firstMessage.text : ""
        expect(text).toContain(model)
        expect(text).toContain(contract)
        expect(text).not.toContain(`bundler: ${compiler}`)
    })

    it("Given one repository, then the prompt keeps the single microfrontend form", async () => {
        const { client, sent } = scriptedClient([{ stopReason: "end_turn", text: "Nothing to do.", toolCalls: [] }])

        await runAiChangeAgent(client, input(), hooks().hooks)

        const firstMessage = sent[0].messages[0]
        expect(firstMessage.role === "user" && firstMessage.text.startsWith("<microfrontend>\nname: Catalog\nslug: catalog\nframework: REACT\nbase_branch: main\n</microfrontend>")).toBe(true)
        expect(sent[0].system).toContain("ONE microfrontend")
        expect(sent[0].system).not.toContain("SEVERAL")
    })

    const ordersService = () => ({
        name: "Orders API",
        slug: "orders",
        runtime: "NODE",
        framework: "Express",
        port: 8080,
        livenessPath: "/health/live",
        readinessPath: "/health/ready",
        docsPath: "/docs",
        openApiPath: "/openapi.json",
        env: [
            { name: "DATABASE_URL", required: true, secret: true, description: "Postgres connection string" },
            { name: "LOG_LEVEL", required: false, secret: false }
        ],
        context: "Routes live in src/routes."
    })

    it("Given one service, then the prompt describes it with its runtime, port, probe and docs paths and env, and points the agent to AGENTS.md", async () => {
        const { client, sent } = scriptedClient([{ stopReason: "end_turn", text: "Nothing to do.", toolCalls: [] }])

        await runAiChangeAgent(client, { ...input(), repositories: [{ baseBranch: "main", workingCopy, service: ordersService() }] }, hooks().hooks)

        const firstMessage = sent[0].messages[0]
        const firstPrompt = firstMessage.role === "user" ? firstMessage.text : ""
        expect(
            firstPrompt.startsWith(
                "<service>\nname: Orders API\nslug: orders\nruntime: NODE\nframework: Express\nport: 8080\nliveness_path: /health/live\nreadiness_path: /health/ready\ndocs_path: /docs\nopenapi_path: /openapi.json\nenv:\n- DATABASE_URL (required, secret): Postgres connection string\n- LOG_LEVEL (optional)\nbase_branch: main\n</service>"
            )
        ).toBe(true)
        expect(firstPrompt).toContain("<service_context>\nRoutes live in src/routes.\n</service_context>")
        expect(sent[0].system).toContain("microfrontends and backend services")
        expect(sent[0].system).toContain("ONE backend service")
        expect(sent[0].system).toContain("AGENTS.md")
        expect(sent[0].system).toContain("liveness_path and readiness_path")
        expect(sent[0].system).toContain("Document every endpoint you add or change in the OpenAPI spec")
        expect(sent[0].system).toContain("You cannot run commands")
    })

    it("Given one microfrontend, then the agent is not sent to AGENTS.md", async () => {
        const { client, sent } = scriptedClient([{ stopReason: "end_turn", text: "Nothing to do.", toolCalls: [] }])

        await runAiChangeAgent(client, input(), hooks().hooks)

        expect(sent[0].system).not.toContain("AGENTS.md")
    })

    it("Given a microfrontend and a service, when it runs, then the service is marked as such and paths start with its slug", async () => {
        const ordersDir = makeRepository({ "src/routes.ts": "export const routes = []\n" })
        try {
            const { client, sent } = scriptedClient([
                { stopReason: "tool_use", text: "", toolCalls: [toolUse("1", "write_file", { path: "orders/src/routes.ts", content: "export const routes = ['price']\n" })] },
                { stopReason: "tool_use", text: "", toolCalls: [toolUse("2", "finish", { summary: "Added the price route" })] }
            ])
            const mixed = {
                ...input(),
                repositories: [...input().repositories, { baseBranch: "main", workingCopy: new GitWorkingCopy(ordersDir, "http://unused", { username: "", password: "" }), service: ordersService() }]
            }

            await runAiChangeAgent(client, mixed, hooks().hooks)

            expect(fs.readFileSync(path.join(ordersDir, "src/routes.ts"), "utf8")).toBe("export const routes = ['price']\n")
            const firstMessage = sent[0].messages[0]
            const firstPrompt = firstMessage.role === "user" ? firstMessage.text : ""
            expect(firstPrompt).toContain("<repository>\nname: Orders API\nkind: backend service\nslug: orders\nruntime: NODE")
            expect(firstPrompt).toContain("<service_context>\nRoutes live in src/routes.\n</service_context>\n</repository>")
            expect(sent[0].system).toContain("SEVERAL microfrontends and backend services")
        } finally {
            fs.rmSync(ordersDir, { recursive: true, force: true })
        }
    })

    it("Given the frontend and the backend of a domain, when it runs, then the prompt carries the domain's description and asks to keep them in step", async () => {
        const ordersDir = makeRepository({ "src/routes.ts": "export const routes = []\n" })
        try {
            const { client, sent } = scriptedClient([{ stopReason: "end_turn", text: "Nothing to do.", toolCalls: [] }])
            const domain = {
                ...input(),
                domain: { name: "Checkout", description: "Everything between the cart and the payment." },
                repositories: [...input().repositories, { baseBranch: "main", workingCopy: new GitWorkingCopy(ordersDir, "http://unused", { username: "", password: "" }), service: ordersService() }]
            }

            await runAiChangeAgent(client, domain, hooks().hooks)

            const firstMessage = sent[0].messages[0]
            const firstPrompt = firstMessage.role === "user" ? firstMessage.text : ""
            expect(firstPrompt).toContain('<domain_context domain="Checkout">\nEverything between the cart and the payment.\n</domain_context>')
            expect(firstPrompt).toContain('belong to the functional domain "Checkout", which groups its frontend (microfrontends) and its backend (services)')
            // The domain sits with the project, before the request.
            expect(firstPrompt.indexOf("<domain_context")).toBeGreaterThan(firstPrompt.indexOf("</repositories>"))
            expect(firstPrompt.indexOf("<domain_context")).toBeLessThan(firstPrompt.indexOf("<request>"))
        } finally {
            fs.rmSync(ordersDir, { recursive: true, force: true })
        }
    })

    it("Given a domain with an AI context, when it runs, then the context follows the description inside the domain block", async () => {
        const { client, sent } = scriptedClient([{ stopReason: "end_turn", text: "Nothing to do.", toolCalls: [] }])
        const domain = { ...input(), domain: { name: "Checkout", description: "Everything between the cart and the payment.", context: "Prices are in cents." } }

        await runAiChangeAgent(client, domain, hooks().hooks)

        const firstMessage = sent[0].messages[0]
        const firstPrompt = firstMessage.role === "user" ? firstMessage.text : ""
        expect(firstPrompt).toContain('<domain_context domain="Checkout">\nEverything between the cart and the payment.\nPrices are in cents.\n</domain_context>')
    })

    it("Given a job not on a domain whose microfrontend is in one, when it runs, then the prompt carries that domain's context without asking to keep a frontend and a backend in step", async () => {
        const { client, sent } = scriptedClient([{ stopReason: "end_turn", text: "Nothing to do.", toolCalls: [] }])

        await runAiChangeAgent(client, { ...input(), memberDomains: [{ name: "Checkout", context: "Prices are in cents." }] }, hooks().hooks)

        const firstMessage = sent[0].messages[0]
        const firstPrompt = firstMessage.role === "user" ? firstMessage.text : ""
        expect(firstPrompt).toContain('<domain_context domain="Checkout">\nPrices are in cents.\n</domain_context>')
        expect(firstPrompt).not.toContain("belong to the functional domain")
    })

    it("Given no domain, then the prompt says nothing of one", async () => {
        const { client, sent } = scriptedClient([{ stopReason: "end_turn", text: "Nothing to do.", toolCalls: [] }])

        await runAiChangeAgent(client, input(), hooks().hooks)

        const firstMessage = sent[0].messages[0]
        expect(firstMessage.role === "user" && firstMessage.text).not.toContain("domain")
    })
})
