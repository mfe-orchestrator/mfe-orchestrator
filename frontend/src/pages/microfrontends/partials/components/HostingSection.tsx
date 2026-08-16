import { Card, CardContent, CardDescription, CardHeader, CardTitle, SelectField } from "@mfe-orchestrator/design-system"
import { useFormContext } from "react-hook-form"
import { useTranslation } from "react-i18next"
import TextField from "@/components/input/TextField.rhf"
import { Storage } from "@/hooks/apiClients/useStorageApi"

const logoMap: Record<string, string> = {
    AWS: "/img/aws.svg",
    GOOGLE: "/img/GoogleCloud.svg",
    AZURE: "/img/Azure.svg"
}

interface HostingSectionProps {
    storages: Storage[]
}

export const HostingSection: React.FC<HostingSectionProps> = ({ storages }) => {
    const { t } = useTranslation()
    const { watch } = useFormContext()
    const hostType = watch("host.type")

    return (
        <Card>
            <CardHeader>
                <CardTitle className="mb-0">{t("microfrontend.hosting_information")}</CardTitle>
                <CardDescription>{t("microfrontend.hosting_information_description")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 pt-3">
                {/* I campi descrivono insieme un solo indirizzo: stanno in riga e vanno a capo
                    solo quando non ci entrano, invece di occupare una riga intera a testa. */}
                <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                    <SelectField
                        name="host.type"
                        containerClassName="flex-[1_1_240px]"
                        label={t("microfrontend.hosting_type")}
                        options={[
                            { value: "MFE_ORCHESTRATOR_HUB", label: t("microfrontend.mfe_orchestrator_hub") },
                            { value: "CUSTOM_URL", label: t("microfrontend.custom_url") },
                            storages?.length > 0 && {
                                value: "CUSTOM_SOURCE",
                                label: t("microfrontend.custom_source")
                            }
                        ].filter(Boolean)}
                        required
                    />

                    {hostType === "CUSTOM_SOURCE" && (
                        <SelectField
                            name="host.storageId"
                            containerClassName="flex-[1_1_240px]"
                            label={t("microfrontend.source")}
                            required
                            options={storages?.map(storage => {
                                return {
                                    value: storage._id,
                                    label: `${storage.name}`,
                                    icon: logoMap[storage.type]
                                }
                            })}
                        />
                    )}

                    {hostType === "CUSTOM_URL" && <TextField name="host.url" containerClassName="flex-[1_1_240px]" label={t("microfrontend.custom_url")} placeholder="https://example.com" required />}

                    <TextField name="host.entryPoint" containerClassName="flex-[1_1_240px]" label={t("microfrontend.entry_point")} placeholder="index.js" />
                </div>
            </CardContent>
        </Card>
    )
}
