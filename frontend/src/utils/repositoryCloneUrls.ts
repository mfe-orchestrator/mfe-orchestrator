export interface RepositoryCloneUrls {
    https?: string
    ssh?: string
}

const asNonEmptyString = (value: unknown): string | undefined => (typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined)

/**
 * Repositories are returned to the frontend as raw provider payloads, so every provider names its clone urls differently:
 * GitHub uses `clone_url`/`ssh_url`, GitLab `http_url_to_repo`/`ssh_url_to_repo` and Azure DevOps `remoteUrl`/`sshUrl`.
 */
export const extractCloneUrls = (repository?: Record<string, unknown> | null): RepositoryCloneUrls => {
    if (!repository) return {}

    return {
        https: asNonEmptyString(repository.clone_url) || asNonEmptyString(repository.http_url_to_repo) || asNonEmptyString(repository.remoteUrl),
        ssh: asNonEmptyString(repository.ssh_url) || asNonEmptyString(repository.ssh_url_to_repo) || asNonEmptyString(repository.sshUrl)
    }
}

export const buildGitCloneCommand = (cloneUrl: string) => `git clone ${cloneUrl}`

/** Deep link handled by VS Code (and forks exposing the same handler) to clone a repository and open it. */
export const buildVsCodeCloneUrl = (cloneUrl: string) => `vscode://vscode.git/clone?url=${encodeURIComponent(cloneUrl)}`
