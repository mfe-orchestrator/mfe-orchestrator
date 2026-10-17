import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@mfe-orchestrator/design-system"
import { useQuery } from "@tanstack/react-query"
import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import useDomainsApi from "@/hooks/apiClients/useDomainsApi"
import useProjectStore from "@/store/useProjectStore"

/** Every item, the items of one domain (its id), or the items in no domain */
export const ALL_DOMAINS = "all"
export const NO_DOMAIN = "none"

export const matchesDomain = (domainId: string | null | undefined, filter: string) => filter === ALL_DOMAINS || (filter === NO_DOMAIN ? !domainId : domainId === filter)

interface DomainFilterProps {
    value: string
    onValueChange: (value: string) => void
}

/** Filters a list of microfrontends or services by functional domain */
export const DomainFilter: React.FC<DomainFilterProps> = ({ value, onValueChange }) => {
    const { t } = useTranslation()
    const domainsApi = useDomainsApi()
    const projectId = useProjectStore(state => state.project?._id)
    const domainsQuery = useQuery({ queryKey: ["domains", projectId], queryFn: domainsApi.getAll, enabled: !!projectId })

    // A domain deleted (or of another project) since it was picked: the filter would hide everything
    useEffect(() => {
        const domains = domainsQuery.data
        if (domains && value !== ALL_DOMAINS && value !== NO_DOMAIN && !domains.some(domain => domain._id === value)) {
            onValueChange(ALL_DOMAINS)
        }
    }, [domainsQuery.data, value, onValueChange])

    return (
        <Select value={value} onValueChange={onValueChange}>
            <SelectTrigger className="min-w-44 max-w-xs" aria-label={t("domains.filter.label")}>
                <SelectValue placeholder={t("domains.filter.label")} />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value={ALL_DOMAINS}>{t("domains.filter.all")}</SelectItem>
                {(domainsQuery.data ?? []).map(domain => (
                    <SelectItem key={domain._id} value={domain._id}>
                        {domain.name}
                    </SelectItem>
                ))}
                <SelectItem value={NO_DOMAIN}>{t("domains.no_domain")}</SelectItem>
            </SelectContent>
        </Select>
    )
}

export default DomainFilter
