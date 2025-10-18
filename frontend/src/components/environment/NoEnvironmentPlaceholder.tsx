import React, { useState } from "react"
import { useTranslation } from "react-i18next"
import presetEnvironmentGroups, { EnvironmentPreset } from "@/utils/EnviromentsPresets"
import EnvironmentSet from "@/components/environment/EnvironmentSet"
import EnvironmentList from "@/components/environment/EnvironmentList"
import useEnvironmentsApi, { EnvironmentDTO } from "@/hooks/apiClients/useEnvironmentsApi"
import { useMutation } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card"
import useToastNotificationStore from "@/store/useToastNotificationStore"

interface NoEnvironmentPlaceholderProps {
    onSaveSuccess: (environments: EnvironmentDTO[]) => void
}

const NoEnvironmentPlaceholder: React.FC<NoEnvironmentPlaceholderProps> = ({ onSaveSuccess }) => {
    const [customEnvironments, setCustomEnvironments] = useState<EnvironmentPreset[]>()
    const environmentsApi = useEnvironmentsApi()
    const notificationToast = useToastNotificationStore()

    const handleAddPresetEnvs = (envs: EnvironmentPreset[]) => {
        const newEnvs = envs.map(env => ({ ...env }))
        setCustomEnvironments(newEnvs)
    }

    const saveEnvironmentsMutation = useMutation({
        mutationFn: async (environments: EnvironmentDTO[]) => {
            const newEnvironments = await environmentsApi.createEnvironmentsBulk(environments)
            notificationToast.showSuccessNotification({
                message: t("environment.created_success_message")
            })
            onSaveSuccess(newEnvironments)
        }
    })

    const { t } = useTranslation()

    return (
        <Card>
            <CardContent>
                <CardHeader>
                    <h2 className="text-lg/6 tracking-normal font-semibold">{t("environment.configure")}</h2>
                </CardHeader>
                <CardContent className="mt-3">
                    <h3 className="text-sm font-medium uppercase text-foreground-secondary tracking-wide mb-2">{t("environment.preset_environments")}</h3>
                    <div className="flex gap-4 flex-wrap">
                        {presetEnvironmentGroups.map((preset, index) => (
                            <EnvironmentSet key={index} name={preset.name} environments={preset.environments} onClick={handleAddPresetEnvs} />
                        ))}
                    </div>
                </CardContent>
                <EnvironmentList
                    environments={customEnvironments}
                    onSaveEnvironments={async e => {
                        await saveEnvironmentsMutation.mutateAsync(e)
                    }}
                />
            </CardContent>
        </Card>
    )
}

export default NoEnvironmentPlaceholder
