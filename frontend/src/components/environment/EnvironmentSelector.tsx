
import React from 'react';

import { Badge } from "@/components/ui/badge/badge"
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
        <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-foreground-secondary">Ambiente:</span>
            <Select
                value={selectedEnvironment?._id}
                onValueChange={value => {
                    onEnvironmentChange(environments.find(env => env._id === value))
                }}
            >
                {selectedEnvironment && (
                    <SelectTrigger className="w-40 py-1">
                        <SelectValue>
                            <Badge style={{ backgroundColor: selectedEnvironment.color }}>{selectedEnvironment.slug}</Badge>
                        </SelectValue>
                    </SelectTrigger>
                )}
                {environments && (
                    <SelectContent>
                        {environments.map(environment => (
                            <SelectItem key={environment._id} value={environment._id}>
                                <Badge style={{ backgroundColor: environment.color }}>{environment.slug}</Badge>
                            </SelectItem>
                        ))}
                    </SelectContent>
                )}
            </Select>
        </div>
    )
}

export default EnvironmentSelector;
