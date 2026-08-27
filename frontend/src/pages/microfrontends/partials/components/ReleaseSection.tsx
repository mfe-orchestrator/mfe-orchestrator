import { Card, CardContent, CardDescription, CardHeader, CardTitle, SelectField, SliderField, SwitchField as Switch } from "@mfe-orchestrator/design-system"
import { useFormContext } from "react-hook-form"
import { useTranslation } from "react-i18next"
import TextField from "@/components/input/TextField.rhf"
import { CanaryDeploymentType, CanaryType } from "@/hooks/apiClients/useMicrofrontendsApi"
import { CANARY_DEPLOYMENT_TYPE_LABEL_KEYS, CANARY_TYPE_DESCRIPTION_KEYS, CANARY_TYPE_LABEL_KEYS } from "../labels"

interface ReleaseSectionProps {
    isEdit?: boolean
    versions?: string[]
}

/** Version and canary settings: the two knobs that decide what gets served, kept above the tabs so they are always visible. */
export const ReleaseSection: React.FC<ReleaseSectionProps> = ({ isEdit, versions }) => {
    const { t } = useTranslation()
    const { watch } = useFormContext()
    const canaryEnabled = watch("canary.enabled")
    const deploymentType = watch("canary.deploymentType")
    const canaryType = (watch("canary.type") as CanaryType | undefined) ?? CanaryType.ON_SESSION
    const hasVersionHistory = Boolean(isEdit && versions && versions.length > 0)
    // On User is an explicit enrolment, not a split: there is no traffic share to set, so asking for a
    // percentage would only suggest it does something.
    const isPercentageBased = canaryType !== CanaryType.ON_USER

    return (
        <Card>
            <CardHeader>
                <CardTitle className="mb-0">{t("microfrontend.release_settings")}</CardTitle>
                <CardDescription>{t("microfrontend.release_settings_description")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 pt-3">
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {hasVersionHistory ? (
                        <>
                            <SelectField
                                name="version"
                                label={t("microfrontend.version")}
                                options={[
                                    ...versions.map(version => ({
                                        value: version,
                                        label: version
                                    })),
                                    { value: "custom", label: t("microfrontend.custom_version") }
                                ]}
                                required
                                containerClassName="flex-[1_1_240px]"
                                className="w-full"
                            />
                            {watch("version") === "custom" && (
                                <TextField
                                    name="customVersion"
                                    label={t("microfrontend.custom_version")}
                                    textTransform={value => value.replace(" ", "")}
                                    placeholder={t("microfrontend.version_placeholder")}
                                    required
                                    containerClassName="flex-[1_1_240px]"
                                />
                            )}
                        </>
                    ) : (
                        <TextField name="version" label={t("microfrontend.version")} placeholder={t("microfrontend.version_placeholder")} required containerClassName="flex-[1_1_240px]" />
                    )}
                </div>

                <div className="border-t border-border pt-4">
                    <div className="flex items-end justify-between flex-wrap gap-x-4 gap-y-2">
                        <div>
                            <h3 className="text-base font-semibold m-0">{t("microfrontend.canary_settings")}</h3>
                            <p className="text-foreground-secondary text-sm m-0">{t("microfrontend.canary_settings_description")}</p>
                        </div>
                        <Switch name="canary.enabled" />
                    </div>

                    {canaryEnabled && (
                        <div className="flex flex-col gap-2 pt-3">
                            {isPercentageBased && (
                                <SliderField
                                    name="canary.percentage"
                                    label={t("microfrontend.canary_percentage")}
                                    unit="%"
                                    min={0}
                                    max={100}
                                    presets={[5, 10, 25, 50]}
                                    presetsLabel={t("microfrontend.canary_percentage_presets")}
                                    required
                                />
                            )}
                            <div className="flex flex-wrap gap-x-4 gap-y-2">
                                <SelectField
                                    name="canary.type"
                                    label={t("microfrontend.canary_type")}
                                    options={Object.values(CanaryType).map(type => ({
                                        value: type,
                                        label: t(CANARY_TYPE_LABEL_KEYS[type])
                                    }))}
                                    required
                                    containerClassName="flex-[1_1_240px]"
                                    className="w-full"
                                />
                                <SelectField
                                    name="canary.deploymentType"
                                    label={t("microfrontend.deployment_type")}
                                    options={Object.values(CanaryDeploymentType).map(type => ({
                                        value: type,
                                        label: t(CANARY_DEPLOYMENT_TYPE_LABEL_KEYS[type])
                                    }))}
                                    required
                                    containerClassName="flex-[1_1_240px]"
                                    className="w-full"
                                />
                            </div>
                            {/* The three types behave in genuinely different ways, and the name of each is not enough to tell them apart. */}
                            <p className="text-foreground-secondary text-sm m-0">{t(CANARY_TYPE_DESCRIPTION_KEYS[canaryType])}</p>
                            {deploymentType === CanaryDeploymentType.BASED_ON_VERSION && <TextField name="canary.version" label={t("microfrontend.canary_version")} placeholder="1.1.0" required />}
                            {deploymentType === CanaryDeploymentType.BASED_ON_URL && (
                                <TextField name="canary.url" label={t("microfrontend.canary_url")} placeholder="https://canary.example.com" required />
                            )}
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}
