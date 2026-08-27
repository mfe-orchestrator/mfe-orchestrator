import { EmptyState } from "@mfe-orchestrator/design-system"
import { CirclePlus, DownloadCloud, PackageOpen, SearchX } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms"

interface MicrofrontendsEmptyStateProps {
    /** `empty` when the project has no microfrontend at all, `no-results` when the search filtered everything out. */
    variant: "empty" | "no-results"
    searchTerm?: string
    onAddNewMicrofrontend?: () => void
    /** Only provided when the project has at least one code repository connection to import from. */
    onImportRepositories?: () => void
    onResetFilters?: () => void
}

export const MicrofrontendsEmptyState: React.FC<MicrofrontendsEmptyStateProps> = ({ variant, searchTerm, onAddNewMicrofrontend, onImportRepositories, onResetFilters }) => {
    const { t } = useTranslation()

    const isNoResults = variant === "no-results"

    return (
        <EmptyState
            variant="outlined"
            size="lg"
            tone="primary"
            icon={isNoResults ? <SearchX /> : <PackageOpen />}
            title={isNoResults ? t("microfrontend.dashboard.noResultsTitle") : t("microfrontend.no_microfrontends_found")}
            description={isNoResults ? t("microfrontend.dashboard.noResultsDescription", { searchTerm }) : t("microfrontend.no_microfrontends_found_description")}
            actions={
                isNoResults ? (
                    <Button variant="secondary" onClick={onResetFilters}>
                        {t("microfrontend.dashboard.resetFilters")}
                    </Button>
                ) : (
                    <>
                        <Button onClick={onAddNewMicrofrontend}>
                            <CirclePlus />
                            {t("microfrontend.add_new")}
                        </Button>
                        {onImportRepositories && (
                            <Button variant="secondary" onClick={onImportRepositories}>
                                <DownloadCloud />
                                {t("microfrontend.import.action")}
                            </Button>
                        )}
                    </>
                )
            }
        />
    )
}

export default MicrofrontendsEmptyState
