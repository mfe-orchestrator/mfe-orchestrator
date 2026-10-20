import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@mfe-orchestrator/design-system"
import { useTranslation } from "react-i18next"
import TextField from "@/components/input/TextField.rhf"

/** The port, the probes, the docs paths and the image repository of a container: a service's, or a frontend's served by its own. */
export const ServiceRuntimeFields: React.FC = () => {
    const { t } = useTranslation()

    return (
        <Card>
            <CardHeader>
                <CardTitle className="mb-0">{t("services.runtime_settings")}</CardTitle>
                <CardDescription>{t("services.runtime_settings_description")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-x-4 gap-y-2 pt-3">
                <TextField name="port" type="number" label={t("services.port")} required containerClassName="flex-[1_1_160px]" />
                <TextField
                    name="livenessPath"
                    label={t("services.liveness_path")}
                    placeholder="/health/live"
                    description={t("services.liveness_path_hint")}
                    required
                    containerClassName="flex-[1_1_240px]"
                />
                <TextField
                    name="readinessPath"
                    label={t("services.readiness_path")}
                    placeholder="/health/ready"
                    description={t("services.readiness_path_hint")}
                    required
                    containerClassName="flex-[1_1_240px]"
                />
                <TextField name="docsPath" label={t("services.docs_path")} placeholder="/docs" description={t("services.docs_path_hint")} containerClassName="flex-[1_1_240px]" />
                <TextField name="openApiPath" label={t("services.openapi_path")} placeholder="/openapi.json" description={t("services.openapi_path_hint")} containerClassName="flex-[1_1_240px]" />
                <TextField
                    name="image.repository"
                    label={t("services.image_repository")}
                    placeholder="ghcr.io/acme/orders-api"
                    description={t("services.image_repository_hint")}
                    containerClassName="flex-[2_1_320px]"
                />
            </CardContent>
        </Card>
    )
}

export default ServiceRuntimeFields
