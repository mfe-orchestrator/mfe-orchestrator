import { useQuery } from "@tanstack/react-query"
import { LayoutTemplate } from "lucide-react"
import { useTranslation } from "react-i18next"
import useMarketApi from "@/hooks/apiClients/useMarketApi"

/**
 * Link to the repository of the template a microfrontend or a service was created from.
 * Renders nothing while loading, when it was not created from a template or when the template has no repository.
 */
export const TemplateRepositoryLink: React.FC<{ slug?: string }> = ({ slug }) => {
    const { t } = useTranslation()
    const { getMarketBySlug } = useMarketApi()

    const marketQuery = useQuery({
        queryKey: ["market", slug],
        queryFn: () => getMarketBySlug(slug!, { silent: true }),
        enabled: !!slug,
        // A template removed from the library is just not linked: no retries, no error toast
        retry: false
    })

    const template = marketQuery.data
    if (!template?.repo) return null

    return (
        <a
            href={template.repo}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-w-0 items-center gap-1 underline-offset-4 hover:text-foreground hover:underline"
            title={t("market.templateRepositoryTitle", { name: template.name })}
        >
            <LayoutTemplate className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{t("market.templateRepository", { name: template.name })}</span>
        </a>
    )
}

export default TemplateRepositoryLink
