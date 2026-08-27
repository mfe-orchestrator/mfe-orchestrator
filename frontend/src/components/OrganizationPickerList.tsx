import { useTranslation } from "react-i18next"
import EntityPickerList from "@/components/EntityPickerList"
import { Organization } from "@/hooks/apiClients/useOrganizationApi"

interface OrganizationPickerListProps {
    organizations: Organization[]
    activeOrganizationId?: string
    onSelect: (organization: Organization) => void
    variant?: "list" | "grid"
    onCreateNew?: () => void
    autoFocusSearch?: boolean
    className?: string
}

/** The organization flavour of the shared picker. */
export const OrganizationPickerList: React.FC<OrganizationPickerListProps> = ({ organizations, activeOrganizationId, onSelect, variant = "list", onCreateNew, autoFocusSearch, className }) => {
    const { t } = useTranslation()

    return (
        <EntityPickerList<Organization>
            items={organizations}
            activeId={activeOrganizationId}
            onSelect={onSelect}
            variant={variant}
            onCreateNew={onCreateNew}
            autoFocusSearch={autoFocusSearch}
            className={className}
            testIdPrefix="organization-option"
            labels={{
                emptyTitle: t("organization.no_organizations"),
                emptyDescription: t("organization.no_organizations_desc"),
                createNew: t("organization.create_new"),
                searchPlaceholder: t("organization.search_placeholder"),
                noResults: t("organization.no_results")
            }}
        />
    )
}

export default OrganizationPickerList
