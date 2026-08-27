import { Card, CardContent, EmptyState } from "@mfe-orchestrator/design-system"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { ApiStatusHandler } from "@/components/organisms"
import useDeploymentsApi from "@/hooks/apiClients/useDeploymentsApi"

export interface DeploymentGateProps extends React.PropsWithChildren {
    environmentId: string
}

const DeploymentGate: React.FC<DeploymentGateProps> = ({ children, environmentId }) => {
    const { t } = useTranslation()
    const deploymentApi = useDeploymentsApi()

    const deploymentQuery = useQuery({
        queryKey: ["deployment", environmentId],
        queryFn: () => deploymentApi.getDeployments(environmentId),
        enabled: !!environmentId
    })
    return (
        <ApiStatusHandler queries={[deploymentQuery]}>
            {deploymentQuery?.data?.length !== 0 ? (
                <div>{children}</div>
            ) : (
                <Card>
                    <CardContent>
                        <EmptyState size="sm" description={t("deployments.no_deployments")} />
                    </CardContent>
                </Card>
            )}
        </ApiStatusHandler>
    )
}

export default DeploymentGate
