import { GitBranch } from "lucide-react"
import type { Microfrontend } from "@/hooks/apiClients/useMicrofrontendsApi"

type CodeRepository = Microfrontend["codeRepository"]

/**
 * The page of a repository on its provider, from the clone url over https: GitHub and GitLab drop the `.git`,
 * Azure DevOps the `org@` before the host.
 */
export const repositoryWebUrl = (repository: Pick<NonNullable<CodeRepository>, "cloneUrlHttps"> | undefined) => repository?.cloneUrlHttps?.replace(/\.git$/, "").replace(/^(https?:\/\/)[^@/]+@/, "$1")

/** Repository name, linked to its page on the provider when it exposed a clone url. Renders the fallback without a repository. */
export const RepositoryLink: React.FC<{ repository: Pick<NonNullable<CodeRepository>, "enabled" | "name" | "cloneUrlHttps"> | undefined; fallback?: React.ReactNode }> = ({
    repository,
    fallback = null
}) => {
    if (!repository?.enabled || !repository.name) return <>{fallback}</>

    const href = repositoryWebUrl(repository)

    return (
        <span className="inline-flex min-w-0 items-center gap-1">
            <GitBranch className="size-3.5 shrink-0" aria-hidden="true" />
            {href ? (
                <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate underline-offset-4 hover:text-foreground hover:underline"
                    title={repository.name}
                    onClick={e => e.stopPropagation()}
                >
                    {repository.name}
                </a>
            ) : (
                <span className="truncate">{repository.name}</span>
            )}
        </span>
    )
}

export default RepositoryLink
