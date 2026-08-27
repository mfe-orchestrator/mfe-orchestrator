import { ColorSwatch, Select, SelectContent, SelectControl, SelectItem, SelectTrigger, SelectValue } from "@mfe-orchestrator/design-system"
import React from "react"
import { useTranslation } from "react-i18next"
import { EnvironmentDTO } from "@/hooks/apiClients/useEnvironmentsApi"

interface EnvironmentSelectorProps {
    selectedEnvironment: EnvironmentDTO
    environments: EnvironmentDTO[]
    onEnvironmentChange: (value: EnvironmentDTO) => void
}

const EnvironmentSelector: React.FC<EnvironmentSelectorProps> = ({ selectedEnvironment, environments, onEnvironmentChange }) => {
    const { t } = useTranslation()

    return (
        <SelectControl label={t("deployments.environment_select")} className="w-full max-w-40 flex-shrink-0">
            <Select
                value={selectedEnvironment?._id}
                onValueChange={value => {
                    onEnvironmentChange(environments.find(env => env._id === value))
                }}
            >
                <SelectTrigger>
                    <SelectValue>
                        {selectedEnvironment ? (
                            <div className="flex items-center gap-2">
                                <ColorSwatch size="sm" color={selectedEnvironment.color} />
                                <span>{selectedEnvironment.slug}</span>
                            </div>
                        ) : (
                            <span>{t("deployments.select_environment")}</span>
                        )}
                    </SelectValue>
                </SelectTrigger>
                {environments && (
                    <SelectContent>
                        {environments.map(environment => (
                            <SelectItem key={environment._id} value={environment._id}>
                                <div className="flex items-center gap-2">
                                    <ColorSwatch size="sm" color={environment.color} />
                                    <span>{environment.slug}</span>
                                </div>
                            </SelectItem>
                        ))}
                    </SelectContent>
                )}
            </Select>
        </SelectControl>
    )
}

export default EnvironmentSelector
