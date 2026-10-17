import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { isProtectedPath, isSecretPath, microfrontendWorkspacePath, normalizeRelativePath, resolveInsideWorkingCopy, serviceWorkspacePath, WorkspacePathError } from "./workspacePaths"

const owner = {
    organization: { slug: "acme", id: "64b000000000000000000001" },
    project: { slug: "portal", id: "64b000000000000000000002" },
    microfrontendSlug: "catalog"
}

describe("microfrontendWorkspacePath", () => {
    it("Given an owner, when the path is built, then it is <root>/<org>-<id>/<project>-<id>/<mfe>", () => {
        expect(microfrontendWorkspacePath("/repositories", owner)).toBe("/repositories/acme-64b000000000000000000001/portal-64b000000000000000000002/catalog")
    })

    it.each(["../etc", "a/b", "", "with space", "x\0y"])("Given the slug %j, when the path is built, then it is refused", slug => {
        expect(() => microfrontendWorkspacePath("/repositories", { ...owner, microfrontendSlug: slug })).toThrow(/workspace folder name/)
    })
})

describe("serviceWorkspacePath", () => {
    it("Given a service with the slug of a microfrontend, when the path is built, then the two folders differ", () => {
        const service = serviceWorkspacePath("/repositories", { ...owner, serviceSlug: "catalog" })
        expect(service).toBe("/repositories/acme-64b000000000000000000001/portal-64b000000000000000000002/catalog.service")
        expect(service).not.toBe(microfrontendWorkspacePath("/repositories", owner))
    })

    it("Given an unsafe slug, when the path is built, then it is refused", () => {
        expect(() => serviceWorkspacePath("/repositories", { ...owner, serviceSlug: "../etc" })).toThrow(/workspace folder name/)
    })
})

describe("normalizeRelativePath", () => {
    it.each(["src/App.tsx", "./src/App.tsx", "src//App.tsx", "src/x/../App.tsx"])("Given %j, when it is normalized, then it is src/App.tsx", requested => {
        expect(normalizeRelativePath(requested)).toBe("src/App.tsx")
    })

    it.each(["../outside", "/etc/passwd", "src/../../outside", ".git/config", ".git", "a\\b", "", "."])("Given %j, when it is normalized, then it is refused", requested => {
        expect(() => normalizeRelativePath(requested)).toThrow(WorkspacePathError)
    })
})

describe("resolveInsideWorkingCopy", () => {
    let tmp: string
    let repo: string

    beforeAll(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-paths-"))
        repo = path.join(tmp, "repo")
        fs.mkdirSync(path.join(repo, "src"), { recursive: true })
        fs.writeFileSync(path.join(repo, "src", "App.tsx"), "")
        fs.writeFileSync(path.join(tmp, "secret.txt"), "other tenant")
        fs.symlinkSync(path.join(tmp, "secret.txt"), path.join(repo, "link-to-file"))
        fs.symlinkSync(tmp, path.join(repo, "link-to-parent"))
        fs.symlinkSync(path.join(repo, "src"), path.join(repo, "link-inside"))
        fs.mkdirSync(path.join(repo, ".git"))
        fs.writeFileSync(path.join(repo, ".git", "config"), "")
        fs.symlinkSync(".git", path.join(repo, "g"))
        fs.mkdirSync(path.join(repo, ".github", "workflows"), { recursive: true })
        fs.symlinkSync(".github/workflows", path.join(repo, "ci"))
    })

    afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

    it("Given a file of the repository, when it is resolved, then its absolute path comes back", async () => {
        expect((await resolveInsideWorkingCopy(repo, "src/App.tsx")).relative).toBe("src/App.tsx")
    })

    it("Given a file that does not exist yet, when it is resolved, then it is allowed", async () => {
        expect((await resolveInsideWorkingCopy(repo, "src/pages/NotFound.tsx")).relative).toBe("src/pages/NotFound.tsx")
    })

    it("Given a symlink to a file outside, when it is resolved, then it is refused", async () => {
        await expect(resolveInsideWorkingCopy(repo, "link-to-file")).rejects.toThrow(/outside the repository/)
    })

    it("Given a path through a symlinked folder outside, when it is resolved, then it is refused even for a new file", async () => {
        await expect(resolveInsideWorkingCopy(repo, "link-to-parent/secret.txt")).rejects.toThrow(/outside the repository/)
        await expect(resolveInsideWorkingCopy(repo, "link-to-parent/new.txt")).rejects.toThrow(/outside the repository/)
    })

    it("Given a symlink that stays inside, when it is resolved, then the real path comes back", async () => {
        expect((await resolveInsideWorkingCopy(repo, "link-inside/App.tsx")).relative).toBe("src/App.tsx")
    })

    it("Given a tracked symlink to .git, when a file through it is resolved, then it is refused", async () => {
        await expect(resolveInsideWorkingCopy(repo, "g/config")).rejects.toThrow(/inside \.git/)
        await expect(resolveInsideWorkingCopy(repo, "g")).rejects.toThrow(/inside \.git/)
    })

    it("Given a symlink to the workflows folder, when a file through it is resolved, then the real path is a protected one", async () => {
        const { relative } = await resolveInsideWorkingCopy(repo, "ci/deploy.yml")

        expect(relative).toBe(".github/workflows/deploy.yml")
        expect(isProtectedPath(relative)).toBe(true)
    })
})

describe("path classes", () => {
    it.each([".env", "apps/web/.env.local", ".npmrc", "certs/server.pem", "id_rsa", "keys/deploy.key"])("Given %j, then it is a secret", file => {
        expect(isSecretPath(file)).toBe(true)
    })

    it.each(["src/env.ts", "README.md", "src/keyboard.ts", "environment.ts"])("Given %j, then it is not a secret", file => {
        expect(isSecretPath(file)).toBe(false)
    })

    it.each([
        ".github/workflows/build.yml",
        ".github/actions/setup/action.yml",
        ".gitlab-ci.yml",
        "azure-pipelines.yml",
        ".circleci/config.yml",
        "Jenkinsfile",
        ".husky/pre-commit",
        "pnpm-lock.yaml",
        "packages/a/package-lock.json",
        "yarn.lock",
        ".npmrc",
        ".yarnrc.yml",
        ".git/config"
    ])("Given %j, then it is protected", file => {
        expect(isProtectedPath(file)).toBe(true)
    })

    it.each([".github/CODEOWNERS", "src/workflows/build.ts", "package.json"])("Given %j, then it is not protected", file => {
        expect(isProtectedPath(file)).toBe(false)
    })
})
