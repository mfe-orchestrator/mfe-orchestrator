import { Select, SelectContent, SelectControl, SelectItem, SelectTrigger, SelectValue } from "@mfe-orchestrator/design-system"
import React from "react"
import { useTranslation } from "react-i18next"
import { Microfrontend } from "@/hooks/apiClients/useMicrofrontendsApi"
import { cn } from "@/utils/styleUtils"

interface MicrofrontendSelectorProps {
    microfrontends: Microfrontend[]
    selectedMicrofrontend: Microfrontend
    onSelect: (value: Microfrontend) => void
    className?: string
}

const MicrofrontendSelector: React.FC<MicrofrontendSelectorProps> = ({ microfrontends, selectedMicrofrontend, onSelect, className = "" }) => {
    const { t } = useTranslation()

    return (
        <SelectControl label={t("integration.microfrontend_select_label")} id="microfrontend-select" className={cn("w-full max-w-80", className)}>
            <Select
                value={selectedMicrofrontend?.slug}
                onValueChange={value => {
                    onSelect(microfrontends.find(mfe => mfe.slug === value))
                }}
            >
                <SelectTrigger className="w-full">
                    <SelectValue>
                        {selectedMicrofrontend ? (
                            <div className="flex items-center gap-2">
                                <span>{selectedMicrofrontend.name}</span>
                            </div>
                        ) : (
                            <span>{t("integration.microfrontend_select_placeholder")}</span>
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
        </SelectControl>
    )
}

export default MicrofrontendSelector
