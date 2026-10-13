import { execFileSync, spawn, spawnSync } from "node:child_process"
import fs from "node:fs"
import http from "node:http"
import { AddressInfo } from "node:net"
import os from "node:os"
import path from "node:path"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { GitWorkingCopy } from "./GitWorkingCopy"

/**
 * A real remote: a bare repository served over smart HTTP by `git http-backend`, the CGI that ships
 * with git. isomorphic-git only speaks HTTP, so this is the closest thing to GitHub that runs
 * offline, and it exercises clone, fetch and push for real instead of a mock of them.
 */
const hasGit = spawnSync("git", ["--version"]).status === 0

const run = (cwd: string, ...args: string[]) =>
    execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } }).trim()

const startGitServer = (projectRoot: string) =>
    new Promise<http.Server>(resolve => {
        const server = http.createServer((request, response) => {
            const url = new URL(request.url ?? "/", "http://localhost")
            const backend = spawn("git", ["http-backend"], {
                env: {
                    ...process.env,
                    GIT_PROJECT_ROOT: projectRoot,
                    GIT_HTTP_EXPORT_ALL: "1",
                    PATH_INFO: url.pathname,
                    QUERY_STRING: url.search.slice(1),
                    REQUEST_METHOD: request.method ?? "GET",
                    CONTENT_TYPE: request.headers["content-type"] ?? "",
                    REMOTE_USER: "tester",
                    REMOTE_ADDR: "127.0.0.1"
                }
            })
            request.pipe(backend.stdin)
            let buffer = Buffer.alloc(0)
            let headersDone = false
            backend.stdout.on("data", (chunk: Buffer) => {
                if (headersDone) return void response.write(chunk)
                buffer = Buffer.concat([buffer, chunk])
                const end = buffer.indexOf("\r\n\r\n")
                if (end === -1) return
                headersDone = true
                let status = 200
                for (const line of buffer.subarray(0, end).toString().split("\r\n")) {
                    const [name, ...rest] = line.split(":")
                    const value = rest.join(":").trim()
                    if (name.toLowerCase() === "status") status = Number.parseInt(value, 10)
                    else response.setHeader(name, value)
                }
                response.statusCode = status
                response.write(buffer.subarray(end + 4))
            })
            backend.stdout.on("end", () => response.end())
        })
        server.listen(0, "127.0.0.1", () => resolve(server))
    })

describe.skipIf(!hasGit)("GitWorkingCopy against a local smart HTTP remote", () => {
    let tmp: string
    let server: http.Server
    let remoteUrl: string
    let seed: string
    let workspace: string

    const credentials = { username: "tester", password: "secret-token" }

    beforeAll(async () => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), "git-working-copy-"))
        const bare = path.join(tmp, "remote", "app.git")
        run(tmp, "init", "--bare", "--initial-branch=main", bare)
        run(bare, "config", "http.receivepack", "true")

        seed = path.join(tmp, "seed")
        run(tmp, "clone", bare, seed)
        fs.mkdirSync(path.join(seed, "src"))
        fs.writeFileSync(path.join(seed, "src", "App.tsx"), "export const App = () => null\n")
        fs.writeFileSync(path.join(seed, "README.md"), "# app\n")
        fs.writeFileSync(path.join(seed, ".gitignore"), "dist\n")
        run(seed, "add", ".")
        run(seed, "commit", "-m", "init")
        run(seed, "push", "origin", "main")

        server = await startGitServer(path.join(tmp, "remote"))
        remoteUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/app.git`
    })

    afterAll(() => {
        server?.close()
        fs.rmSync(tmp, { recursive: true, force: true })
    })

    beforeEach(() => {
        workspace = path.join(tmp, `ws-${Math.random().toString(16).slice(2)}`)
    })

    it("Given no working copy, when it is prepared, then the branch is cloned and no credential lands in .git/config", async () => {
        const copy = new GitWorkingCopy(workspace, remoteUrl, credentials)

        const head = await copy.prepare("main")

        expect(head).toBe(run(seed, "rev-parse", "HEAD"))
        expect(await copy.listFiles()).toEqual([".gitignore", "README.md", "src/App.tsx"])
        expect(fs.readFileSync(path.join(workspace, ".git", "config"), "utf8")).not.toContain("secret-token")
    })

    it("Given a working copy left dirty, when it is prepared again, then it is back to the remote with the new commits", async () => {
        const copy = new GitWorkingCopy(workspace, remoteUrl, credentials)
        await copy.prepare("main")
        fs.writeFileSync(path.join(workspace, "README.md"), "changed\n")
        fs.writeFileSync(path.join(workspace, "leftover.txt"), "x\n")
        fs.rmSync(path.join(workspace, "src", "App.tsx"))

        fs.writeFileSync(path.join(seed, "NEW.md"), "new\n")
        run(seed, "add", ".")
        run(seed, "commit", "-m", "second")
        run(seed, "push", "origin", "main")

        const head = await copy.prepare("main")

        expect(head).toBe(run(seed, "rev-parse", "HEAD"))
        expect(fs.readFileSync(path.join(workspace, "README.md"), "utf8")).toBe("# app\n")
        expect(fs.existsSync(path.join(workspace, "leftover.txt"))).toBe(false)
        expect(fs.existsSync(path.join(workspace, "src", "App.tsx"))).toBe(true)
        expect(fs.existsSync(path.join(workspace, "NEW.md"))).toBe(true)
        expect(await copy.changes()).toEqual([])
    })

    it("Given edits in the working tree, when the changes are read, then creations, updates and deletions come back with the base blob", async () => {
        const copy = new GitWorkingCopy(workspace, remoteUrl, credentials)
        await copy.prepare("main")
        fs.writeFileSync(path.join(workspace, "README.md"), "# app, edited\n")
        fs.writeFileSync(path.join(workspace, "src", "NotFound.tsx"), "export const NotFound = () => null\n")
        fs.rmSync(path.join(workspace, ".gitignore"))
        fs.mkdirSync(path.join(workspace, "dist"))

        const changes = await copy.changes()

        expect(changes.map(({ path, action }) => ({ path, action }))).toEqual([
            { path: ".gitignore", action: "delete" },
            { path: "README.md", action: "update" },
            { path: "src/NotFound.tsx", action: "create" }
        ])
        expect(changes.find(change => change.path === "README.md")?.baseBlobOid).toBe(run(seed, "rev-parse", "HEAD:README.md"))
    })

    it("Given files to commit, when they are pushed, then the remote has a new branch with one commit and the working copy is clean on the base", async () => {
        const copy = new GitWorkingCopy(workspace, remoteUrl, credentials)
        await copy.prepare("main")

        await copy.commitAndPush({
            branch: "ai/app-test",
            message: "feat: add a 404 page",
            author: { name: "Ada", email: "ada@example.com" },
            files: [
                { path: "src/NotFound.tsx", action: "create", content: "export const NotFound = () => null\n" },
                { path: "README.md", action: "update", content: "# app\n\nNow with a 404 page.\n" },
                { path: ".gitignore", action: "delete" }
            ]
        })

        run(seed, "fetch", "origin", "ai/app-test")
        expect(run(seed, "log", "--format=%an <%ae>|%cn|%s", "-1", "FETCH_HEAD")).toBe("Ada <ada@example.com>|MFE Orchestrator|feat: add a 404 page")
        expect(run(seed, "show", "FETCH_HEAD:README.md")).toBe("# app\n\nNow with a 404 page.")
        expect(run(seed, "rev-list", "--count", "origin/main..FETCH_HEAD")).toBe("1")
        expect(run(seed, "ls-tree", "--name-only", "FETCH_HEAD")).not.toContain(".gitignore")

        expect(await copy.changes()).toEqual([])
        expect(fs.existsSync(path.join(workspace, "src", "NotFound.tsx"))).toBe(false)
    })

    it("Given a corsProxy planted in .git/config, when the copy is prepared again, then the remote is still reached directly", async () => {
        const copy = new GitWorkingCopy(workspace, remoteUrl, credentials)
        await copy.prepare("main")
        fs.appendFileSync(path.join(workspace, ".git", "config"), "[http]\n\tcorsProxy = http://127.0.0.1:9\n")

        await expect(copy.prepare("main")).resolves.toBe(run(seed, "rev-parse", "origin/main"))
    })

    it("Given a folder that became a symlink to outside after the proposal, when files are committed into it, then nothing is written outside and nothing is pushed", async () => {
        const copy = new GitWorkingCopy(workspace, remoteUrl, credentials)
        await copy.prepare("main")
        const outside = fs.mkdtempSync(path.join(tmp, "outside-"))
        fs.rmSync(path.join(workspace, "src"), { recursive: true })
        fs.symlinkSync(outside, path.join(workspace, "src"))

        await expect(
            copy.commitAndPush({ branch: "ai/escape", message: "x", author: { name: "a", email: "a@a" }, files: [{ path: "src/pwned.txt", action: "create", content: "x" }] })
        ).rejects.toThrow(/outside the repository/)
        expect(fs.readdirSync(outside)).toEqual([])
        expect(() => run(seed, "ls-remote", "--exit-code", "origin", "ai/escape")).toThrow()
    })
})
