import { Card, CardHeader, CardTitle } from "@mfe-orchestrator/design-system"
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/atoms"
import { DeployedService } from "@/hooks/apiClients/useDeploymentsApi"

interface DeploymentServiceCardProps {
    service: DeployedService
}

export const DeploymentServiceCard: React.FC<DeploymentServiceCardProps> = ({ service }) => {
    const { t } = useTranslation()

    return (
        <Card>
            <CardHeader className="flex-row items-end justify-between flex-wrap-reverse border-0">
                <div className="min-w-0">
                    <CardTitle className="mb-0 text-base truncate" title={service.name}>
                        {service.name}
                    </CardTitle>
                    <div className="text-sm text-foreground-secondary truncate" title={service.slug}>
                        {service.slug}
                    </div>
                </div>
                <Badge className="shrink-0" title={service.version ? t("deployments.service_card.version") : t("deployments.service_card.no_version")}>
                    {service.version || "—"}
                </Badge>
            </CardHeader>
        </Card>
    )
}

export default DeploymentServiceCard
