import { Card } from "@mfe-orchestrator/design-system"
import { useQuery } from "@tanstack/react-query"
import { ApiStatusHandler } from "@/components/organisms"
import useDeploymentsApi from "@/hooks/apiClients/useDeploymentsApi"

export interface DeploymentGateProps extends React.PropsWithChildren {
    environmentId: string
}

const DeploymentGate: React.FC<DeploymentGateProps> = ({ children, environmentId }) => {
    const deploymentApi = useDeploymentsApi()

    const deploymentQuery = useQuery({
        queryKey: ["deployment", environmentId],
        queryFn: () => deploymentApi.getDeployments(environmentId),
        enabled: !!environmentId
    })
    return <ApiStatusHandler queries={[deploymentQuery]}>{deploymentQuery?.data?.length !== 0 ? <div>{children}</div> : <Card>No deployments found</Card>}</ApiStatusHandler>
}

export default DeploymentGate
