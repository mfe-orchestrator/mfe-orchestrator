import { ExternalLink } from "lucide-react"
import { useTranslation } from "react-i18next"
import { CodeRepositoryProvider } from "@/hooks/apiClients/useCodeRepositoriesApi"

/** Brand names are not translated: they read the same in every language. */
const PROVIDERS: Record<CodeRepositoryProvider, { name: string; logo: string }> = {
    [CodeRepositoryProvider.GITHUB]: { name: "GitHub", logo: "/img/GitHub.svg" },
    [CodeRepositoryProvider.GITLAB]: { name: "GitLab", logo: "/img/GitLab.svg" },
    [CodeRepositoryProvider.AZURE_DEV_OPS]: { name: "Azure DevOps", logo: "/img/AzureDevOps.svg" }
}

interface ProviderRunLinkProps {
    url: string
    provider?: CodeRepositoryProvider
}

/** Opens one run on the CI platform it ran on, named and badged with that platform. */
const ProviderRunLink: React.FC<ProviderRunLinkProps> = ({ url, provider }) => {
    const { t } = useTranslation()
    const known = provider ? PROVIDERS[provider] : undefined

    return (
        <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm underline whitespace-nowrap">
            {known && <img src={known.logo} alt="" className="size-4" />}
            {known ? t("builds.table.open_run_on", { provider: known.name }) : t("builds.table.open_run")}
            <ExternalLink className="size-3.5" />
        </a>
    )
}

export default ProviderRunLink
