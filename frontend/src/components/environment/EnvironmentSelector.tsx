import React from "react"
import { EnvironmentDTO } from "@/hooks/apiClients/useEnvironmentsApi"
import { useTranslation } from "react-i18next"
import { SelectContent } from "../ui/select/partials/selectContent/selectContent"
import { SelectItem } from "../ui/select/partials/selectItem/selectItem"
import { SelectTrigger } from "../ui/select/partials/selectTrigger/selectTrigger"
import { Select, SelectValue } from "../ui/select/select"

interface EnvironmentSelectorProps {
    selectedEnvironment: EnvironmentDTO
    environments: EnvironmentDTO[]
    onEnvironmentChange: (value: EnvironmentDTO) => void
}

const EnvironmentSelector: React.FC<EnvironmentSelectorProps> = ({ selectedEnvironment, environments, onEnvironmentChange }) => {
    const { t } = useTranslation()

    return (
        <div className="flex flex-col gap-1 w-full max-w-40 flex-shrink-0">
            <span className="text-sm font-medium text-foreground-secondary">{t("deployments.environment_select")}:</span>
            <Select
                value={selectedEnvironment?._id}
                onValueChange={value => {
                    onEnvironmentChange(environments.find(env => env._id === value))
                }}
            >
                {selectedEnvironment && (
                    <SelectTrigger>
                        <SelectValue>
                            <div className="flex items-center gap-2">
                                <span className="w-4 h-4 rounded-full border-2 border-border" style={{ backgroundColor: selectedEnvironment.color }} />
                                <span>{selectedEnvironment.slug}</span>
                            </div>
                        </SelectValue>
                    </SelectTrigger>
                )}
                {environments && (
                    <SelectContent>
                        {environments.map(environment => (
                            <SelectItem key={environment._id} value={environment._id}>
                                <div className="flex items-center gap-2">
                                    <span className="w-4 h-4 rounded-full border-2 border-border" style={{ backgroundColor: environment.color }} />
                                    <span>{environment.slug}</span>
                                </div>
                            </SelectItem>
                        ))}
                    </SelectContent>
                )}
            </Select>
        </div>
    )
}

export default EnvironmentSelector
