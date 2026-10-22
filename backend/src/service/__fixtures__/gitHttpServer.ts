import { execFileSync, spawn, spawnSync } from "node:child_process"
import http from "node:http"

/**
 * A real remote: a bare repository served over smart HTTP by `git http-backend`, the CGI that ships
 * with git. isomorphic-git only speaks HTTP, so this is the closest thing to GitHub that runs
 * offline, and it exercises clone, fetch and push for real instead of a mock of them.
 */
export const hasGit = spawnSync("git", ["--version"]).status === 0

export const run = (cwd: string, ...args: string[]) =>
    execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } }).trim()

export const startGitServer = (projectRoot: string) =>
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
