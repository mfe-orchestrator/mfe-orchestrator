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
    const Icon = isNoResults ? SearchX : PackageOpen

    return (
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed border-divider bg-card px-6 py-16 text-center">
            <div className="rounded-full bg-primary/15 p-4">
                <Icon className="size-8 text-primary" />
            </div>
            <div className="max-w-md">
                <h2 className="text-lg font-semibold text-foreground">{isNoResults ? t("microfrontend.dashboard.noResultsTitle") : t("microfrontend.no_microfrontends_found")}</h2>
                <p className="mt-1 text-sm text-foreground-secondary">
                    {isNoResults ? t("microfrontend.dashboard.noResultsDescription", { searchTerm }) : t("microfrontend.no_microfrontends_found_description")}
                </p>
            </div>
            {isNoResults ? (
                <Button variant="secondary" onClick={onResetFilters}>
                    {t("microfrontend.dashboard.resetFilters")}
                </Button>
            ) : (
                <div className="flex flex-wrap items-center justify-center gap-2">
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
                </div>
            )}
        </div>
    )
}

export default MicrofrontendsEmptyState
