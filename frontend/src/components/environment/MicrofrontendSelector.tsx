import React from "react"
import { EnvironmentDTO } from "@/hooks/apiClients/useEnvironmentsApi"
import { useTranslation } from "react-i18next"
import { SelectContent } from "../ui/select/partials/selectContent/selectContent"
import { SelectItem } from "../ui/select/partials/selectItem/selectItem"
import { SelectTrigger } from "../ui/select/partials/selectTrigger/selectTrigger"
import { Select, SelectValue } from "../ui/select/select"
import { Microfrontend } from "@/hooks/apiClients/useMicrofrontendsApi"

interface MicrofrontendSelectorProps {
    microfrontends: Microfrontend[]
    selectedMicrofrontend: Microfrontend
    onSelect: (value: Microfrontend) => void
    className?: string
}

const MicrofrontendSelector: React.FC<MicrofrontendSelectorProps> = ({ microfrontends, selectedMicrofrontend, onSelect, className = "" }) => {
    const { t } = useTranslation()

    console.log("Microfrontends", microfrontends)
    return (
        <div className={className + " flex flex-col gap-1 w-full flex-shrink-0"}>
            <span className="text-sm font-medium text-foreground-secondary">{t("deployments.microfrontend_select")}:</span>
            <Select
                value={selectedMicrofrontend?.slug}
                id="microfrontend-select"
                onValueChange={value => {
                    onSelect(microfrontends.find(mfe => mfe.slug === value))
                }}
            >
                <SelectTrigger>
                    <SelectValue>
                        {selectedMicrofrontend ? (
                            <div className="flex items-center gap-2">
                                <span>{selectedMicrofrontend.name}</span>
                            </div>
                        ) : (
                            <span>{t("deployments.select_microfrontend")}</span>
                        )}
                    </SelectValue>
                </SelectTrigger>
                {microfrontends && (
                    <SelectContent>
                        {microfrontends.map(microfrontend => (
                            <SelectItem key={microfrontend.slug} value={microfrontend.slug}>
                                <div className="flex items-center gap-2">
                                    <span>{microfrontend.name}</span>
                                </div>
                            </SelectItem>
                        ))}
                    </SelectContent>
                )}
            </Select>
        </div>
    )
}

export default MicrofrontendSelector
