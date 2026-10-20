import fs from "node:fs/promises"
import path from "node:path"
import { createBusinessException } from "../errors/BusinessException"

const SAFE_SEGMENT = /^[a-z0-9][a-z0-9-]*$/

/** One folder name of the workspace: a slug, optionally followed by an id. Anything else is refused. */
const safeSegment = (value: string): string => {
    const segment = value.toLowerCase()
    if (!SAFE_SEGMENT.test(segment) || segment.length > 200) {
        throw createBusinessException({ code: "WORKSPACE_INVALID_SEGMENT", message: `"${value}" cannot be used as a workspace folder name`, statusCode: 400 })
    }
    return segment
}

export interface WorkspaceOwner {
    organization: { slug: string; id: string }
    project: { slug: string; id: string }
    microfrontendSlug: string
}

/**
 * `<root>/<orgSlug>-<orgId>/<projectSlug>-<projectId>/<mfeSlug>`.
 *
 * Slug and id together, like the folder uploaded bundles live in: the slug keeps it readable, the
 * id keeps it unique and stable should an organization be renamed. A microfrontend slug is unique
 * in its project and cannot change, so it stands alone.
 */
export const organizationWorkspacePath = (root: string, organization: WorkspaceOwner["organization"]) => path.join(path.resolve(root), safeSegment(`${organization.slug}-${organization.id}`))

export const projectWorkspacePath = (root: string, owner: Pick<WorkspaceOwner, "organization" | "project">) =>
    path.join(organizationWorkspacePath(root, owner.organization), safeSegment(`${owner.project.slug}-${owner.project.id}`))

export const microfrontendWorkspacePath = (root: string, owner: WorkspaceOwner) => path.join(projectWorkspacePath(root, owner), safeSegment(owner.microfrontendSlug))

/**
 * `<project folder>/<serviceSlug>.service`. A service may share its slug with a microfrontend of the
 * project: the suffix keeps the two clones (and the locks named after their folder) apart, and no
 * microfrontend folder can end with it since a slug segment holds no dot.
 */
export const serviceWorkspacePath = (root: string, owner: Pick<WorkspaceOwner, "organization" | "project"> & { serviceSlug: string }) =>
    path.join(projectWorkspacePath(root, owner), `${safeSegment(owner.serviceSlug)}.service`)

/** `<project folder>/variables.gitops`: the repository config maps and secrets are committed to. No slug holds a dot, so no component folder can take it. */
export const gitOpsWorkspacePath = (root: string, owner: Pick<WorkspaceOwner, "organization" | "project">) => path.join(projectWorkspacePath(root, owner), "variables.gitops")

export class WorkspacePathError extends Error {}

/** Paths an agent may never read: credentials that can sit in a repository by mistake. */
const SECRET_FILE = /(^|\/)(\.env(\..*)?|\.npmrc|\.netrc|id_rsa[^/]*|id_ed25519[^/]*|[^/]+\.(pem|key|p12|pfx|keystore|jks))$/i

/**
 * Paths an agent may never write. Pushing a branch runs CI with the repository secrets before anyone
 * merges, so whatever CI executes directly is off limits, and so are lockfiles and the registry
 * configuration, which decide what gets installed. This is a second line: build configs, tests and
 * package.json scripts also run in CI, and only the human review of the diff covers those.
 */
const PROTECTED_FILE = new RegExp(
    [
        "^\\.git(/|$)",
        "^\\.github/(workflows|actions)/",
        "^\\.gitlab-ci\\.yml$",
        "^\\.gitlab/",
        "^azure-pipelines[^/]*\\.ya?ml$",
        "^\\.azure-pipelines/",
        "^\\.circleci/",
        "^bitbucket-pipelines\\.yml$",
        "(^|/)Jenkinsfile[^/]*$",
        "^\\.husky/",
        "(^|/)(pnpm-lock\\.yaml|package-lock\\.json|yarn\\.lock|npm-shrinkwrap\\.json|bun\\.lockb?)$",
        "(^|/)(\\.npmrc|\\.yarnrc(\\.yml)?|\\.pnpmfile\\.cjs)$"
    ].join("|")
)

export const isSecretPath = (relativePath: string) => SECRET_FILE.test(relativePath)
export const isProtectedPath = (relativePath: string) => PROTECTED_FILE.test(relativePath)

/**
 * The repository-relative form of a path an agent passed, refused when it leaves the working copy.
 *
 * Purely lexical: `..`, absolute paths, backslashes and `.git` are caught here, before the
 * filesystem is touched. Symlinks are checked separately by {@link resolveInsideWorkingCopy}.
 */
export const normalizeRelativePath = (requested: string): string => {
    if (typeof requested !== "string" || requested.length === 0 || requested.length > 1000 || requested.includes("\0") || requested.includes("\\")) {
        throw new WorkspacePathError(`Invalid path "${requested}"`)
    }
    const normalized = path.posix.normalize(requested.replace(/^\.\/+/, ""))
    if (normalized.startsWith("/") || normalized === ".." || normalized.startsWith("../") || normalized === "." || normalized === "") {
        throw new WorkspacePathError(`Path "${requested}" is outside the repository`)
    }
    if (normalized === ".git" || normalized.startsWith(".git/")) {
        throw new WorkspacePathError(`Path "${requested}" is inside .git`)
    }
    return normalized
}

const isInsideGitDir = (relative: string) => relative === ".git" || relative.startsWith(".git/")

/**
 * Where `requested` really lands inside `workingCopy`, after following symlinks.
 *
 * A repository can commit a symlink to `/etc`, to the parent folder where the other projects of the
 * installation live, or to its own `.git`. The returned `relative` is the real location, so callers
 * must apply their rules (secret, protected, ignored) to it and never to the path as typed: a link
 * `ci -> .github/workflows` would otherwise turn `ci/x.yml` into a workflow. The deepest existing
 * ancestor is resolved, so the check also holds for a file about to be created.
 */
export const resolveInsideWorkingCopy = async (workingCopy: string, requested: string): Promise<{ absolute: string; relative: string }> => {
    const lexical = normalizeRelativePath(requested)
    const root = await fs.realpath(workingCopy)

    let existing = path.join(root, lexical)
    const missing: string[] = []
    for (;;) {
        try {
            existing = await fs.realpath(existing)
            break
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
            const parent = path.dirname(existing)
            if (parent === existing) break
            missing.unshift(path.basename(existing))
            existing = parent
        }
    }
    if (existing !== root && !existing.startsWith(root + path.sep)) {
        throw new WorkspacePathError(`Path "${requested}" points outside the repository`)
    }
    const absolute = path.join(existing, ...missing)
    const relative = path.relative(root, absolute).split(path.sep).join("/")
    if (relative === "" || isInsideGitDir(relative)) {
        throw new WorkspacePathError(`Path "${requested}" is inside .git`)
    }
    return { absolute, relative }
}
