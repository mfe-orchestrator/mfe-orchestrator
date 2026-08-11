import { Card, CardContent, CardDescription, CardHeader, CardTitle, SelectField, SwitchField as Switch } from "@mfe-orchestrator/design-system"
import { useFormContext } from "react-hook-form"
import { useTranslation } from "react-i18next"
import TextField from "@/components/input/TextField.rhf"

export const CanarySection: React.FC = () => {
    const { t } = useTranslation()
    const { watch } = useFormContext()
    const canaryEnabled = watch("canary.enabled")
    const deploymentType = watch("canary.deploymentType")

    return (
        <div className="relative">
            <Card>
                <CardHeader className={!canaryEnabled ? "border-b-0 pb-0" : ""}>
                    <div className="flex items-end justify-between flex-wrap gap-x-4 gap-y-2">
                        <div>
                            <CardTitle className="mb-0">{t("microfrontend.canary_settings")}</CardTitle>
                            <CardDescription>{t("microfrontend.canary_settings_description")}</CardDescription>
                        </div>
                        <Switch name="canary.enabled" />
                    </div>
                </CardHeader>
                {canaryEnabled && (
                    <CardContent className="flex flex-col gap-2 pt-3">
                        <TextField name="canary.percentage" label={t("microfrontend.canary_percentage")} placeholder="38%" type="number" required min={0} max={100} />
                        <div className="flex flex-wrap gap-x-4 gap-y-2">
                            <SelectField
                                name="canary.type"
                                label={t("microfrontend.canary_type")}
                                options={[
                                    { value: "ON_SESSIONS", label: t("microfrontend.on_sessions") },
                                    { value: "ON_USER", label: t("microfrontend.on_user") },
                                    { value: "COOKIE_BASED", label: t("microfrontend.cookie_based") }
                                ]}
                                required
                                containerClassName="flex-[1_1_240px]"
                            />
                            <SelectField
                                name="canary.deploymentType"
                                label={t("microfrontend.deployment_type")}
                                options={[
                                    { value: "BASED_ON_VERSION", label: t("microfrontend.based_on_version") },
                                    { value: "BASED_ON_URL", label: t("microfrontend.based_on_url") }
                                ]}
                                required
                                containerClassName="flex-[1_1_240px]"
                            />
                        </div>
                        {deploymentType === "BASED_ON_VERSION" && <TextField name="canary.canaryVersion" label={t("microfrontend.canary_version")} placeholder="1.1.0" required />}
                        {deploymentType === "BASED_ON_URL" && <TextField name="canary.canaryUrl" label={t("microfrontend.canary_url")} placeholder="https://canary.example.com" required />}
                    </CardContent>
                )}
            </Card>
        </div>
    )
}
