import { GitBranch } from "lucide-react"
import type { Service } from "@/hooks/apiClients/useServicesApi"

/** Repository name, linked to the clone url over https when the provider exposed one. */
export const RepositoryLink: React.FC<{ service: Service }> = ({ service }) => {
    const repository = service.codeRepository
    if (!repository?.enabled || !repository.name) return <span className="text-foreground-secondary">—</span>

    const href = repository.cloneUrlHttps?.replace(/\.git$/, "")

    return (
        <span className="inline-flex min-w-0 items-center gap-1">
            <GitBranch className="size-3.5 shrink-0" aria-hidden="true" />
            {href ? (
                <a href={href} target="_blank" rel="noreferrer" className="truncate underline-offset-4 hover:underline" title={repository.name} onClick={e => e.stopPropagation()}>
                    {repository.name}
                </a>
            ) : (
                <span className="truncate">{repository.name}</span>
            )}
        </span>
    )
}

export default RepositoryLink
