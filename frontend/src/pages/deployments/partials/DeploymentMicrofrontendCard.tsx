import { Card, CardContent, CardHeader, CardTitle } from "@mfe-orchestrator/design-system"
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/atoms"
import { CanaryDeploymentType, Microfrontend } from "@/hooks/apiClients/useMicrofrontendsApi"
import { CANARY_DEPLOYMENT_TYPE_LABEL_KEYS, CANARY_TYPE_LABEL_KEYS } from "@/pages/microfrontends/partials/labels"

interface DeploymentMicrofrontendCardProps {
    microfrontend: Microfrontend
}

export const DeploymentMicrofrontendCard: React.FC<DeploymentMicrofrontendCardProps> = ({ microfrontend }) => {
    const { t } = useTranslation()

    const canary = microfrontend.canary?.enabled ? microfrontend.canary : undefined
    const canaryPercentage = Math.min(100, Math.max(0, canary?.percentage ?? 0))
    const isUrlBased = canary?.deploymentType === CanaryDeploymentType.BASED_ON_URL
    const canaryTarget = isUrlBased ? canary?.url : canary?.version
    const canaryTargetLabel = isUrlBased ? t("microfrontend.canaryUrl") : t("microfrontend.canaryVersion")

    return (
        <Card>
            <CardHeader className="flex-row items-end justify-between flex-wrap-reverse border-0 pb-0">
                <div className="min-w-0">
                    <CardTitle className="mb-0 text-base truncate" title={microfrontend.name}>
                        {microfrontend.name}
                    </CardTitle>
                    <div className="text-sm text-foreground-secondary truncate" title={microfrontend.slug}>
                        {microfrontend.slug}
                    </div>
                </div>
                <Badge className="shrink-0" title={t("deployments.microfrontend_card.stable_version")}>
                    {microfrontend.version}
                </Badge>
            </CardHeader>
            {canary && (
                <CardContent className="pt-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="accent" title={t("microfrontend.canaryReleaseActive")}>
                            {t("deployments.microfrontend_card.canary_traffic", { percentage: canaryPercentage })}
                        </Badge>
                        {canary.type && <Badge variant="outline">{t(CANARY_TYPE_LABEL_KEYS[canary.type])}</Badge>}
                        {canary.deploymentType && <Badge variant="outline">{t(CANARY_DEPLOYMENT_TYPE_LABEL_KEYS[canary.deploymentType])}</Badge>}
                    </div>
                    <p className="mt-2 truncate text-xs text-foreground-secondary" title={canaryTarget}>
                        {canaryTargetLabel}: {canaryTarget || t("deployments.microfrontend_card.canary_target_missing")}
                    </p>
                </CardContent>
            )}
        </Card>
    )
}

export default DeploymentMicrofrontendCard
