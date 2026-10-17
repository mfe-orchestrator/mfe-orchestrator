import { SelectField } from "@mfe-orchestrator/design-system"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import useDomainsApi from "@/hooks/apiClients/useDomainsApi"
import useProjectStore from "@/store/useProjectStore"

/** The optional functional domain of a microfrontend or a service, bound to the `domainId` field of the form */
export const DomainSelectField: React.FC<{ containerClassName?: string }> = ({ containerClassName }) => {
    const { t } = useTranslation()
    const domainsApi = useDomainsApi()
    const projectId = useProjectStore(state => state.project?._id)
    const domainsQuery = useQuery({ queryKey: ["domains", projectId], queryFn: domainsApi.getAll, enabled: !!projectId })

    return (
        <SelectField
            name="domainId"
            label={t("domains.field.label")}
            placeholder={t("domains.no_domain")}
            description={t("domains.field.hint")}
            options={(domainsQuery.data ?? []).map(domain => ({ value: domain._id, label: domain.name }))}
            addClearButton
            clearLabel={t("domains.field.clear")}
            noOptionsLabel={t("domains.field.no_options")}
            containerClassName={containerClassName}
            dataTestId="domain-select"
        />
    )
}

export default DomainSelectField
