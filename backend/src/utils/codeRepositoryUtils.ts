import { CodeRepositoryProvider } from "../models/CodeRepositoryModel"

export interface NormalizedRepository {
    repositoryId: string
    name: string
    description?: string
    defaultBranch?: string
    cloneUrlHttps?: string
    cloneUrlSsh?: string
    webUrl?: string
    gitlab?: {
        groupId?: number
        path?: string
    }
}

const asNonEmptyString = (value: unknown): string | undefined => (typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined)

const asNumber = (value: unknown): number | undefined => {
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string" && value.trim().length > 0 && Number.isFinite(Number(value))) return Number(value)
    return undefined
}

const asId = (value: unknown): string | undefined => asNonEmptyString(value) ?? asNumber(value)?.toString()

/**
 * Repositories are read straight from the providers, and each of them names the same information differently:
 * GitHub uses `clone_url`/`ssh_url`/`html_url`, GitLab `http_url_to_repo`/`ssh_url_to_repo`/`web_url` and
 * Azure DevOps `remoteUrl`/`sshUrl`/`webUrl`. This flattens all of them into a single shape.
 */
export const normalizeRepository = (repository: Record<string, unknown>, provider: CodeRepositoryProvider): NormalizedRepository | undefined => {
    const name = asNonEmptyString(repository.name)
    if (!name) return undefined

    const normalized: NormalizedRepository = {
        // Falls back to the name because it is the only identifier every provider is guaranteed to expose.
        repositoryId: asId(repository.id) ?? name,
        name,
        description: asNonEmptyString(repository.description),
        defaultBranch: (asNonEmptyString(repository.default_branch) ?? asNonEmptyString(repository.defaultBranch))?.replace("refs/heads/", ""),
        cloneUrlHttps: asNonEmptyString(repository.clone_url) ?? asNonEmptyString(repository.http_url_to_repo) ?? asNonEmptyString(repository.remoteUrl),
        cloneUrlSsh: asNonEmptyString(repository.ssh_url) ?? asNonEmptyString(repository.ssh_url_to_repo) ?? asNonEmptyString(repository.sshUrl),
        webUrl: asNonEmptyString(repository.html_url) ?? asNonEmptyString(repository.web_url) ?? asNonEmptyString(repository.webUrl)
    }

    if (provider === CodeRepositoryProvider.GITLAB) {
        const namespace = repository.namespace as Record<string, unknown> | undefined
        normalized.gitlab = {
            groupId: asNumber(namespace?.id),
            path: asNonEmptyString(repository.path_with_namespace)
        }
    }

    return normalized
}

/** Mirrors the slug the frontend derives from a name, collapsing separators so the result is always a usable slug. */
export const slugifyRepositoryName = (name: string): string =>
    name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")

/** Slugs are unique per project, so already taken ones get a numeric suffix instead of failing the whole import. */
export const buildUniqueSlug = (name: string, takenSlugs: Set<string>): string => {
    const base = slugifyRepositoryName(name) || "microfrontend"

    if (!takenSlugs.has(base)) return base

    let counter = 2
    while (takenSlugs.has(`${base}-${counter}`)) {
        counter++
    }

    return `${base}-${counter}`
}
