import useDeploymentsApi from "@/hooks/apiClients/useDeploymentsApi";
import { useQuery } from "@tanstack/react-query";
import ApiDataFetcher from "./ApiDataFetcher/ApiDataFetcher";
import { Card } from "./ui/card";

export interface DeploymentGateProps extends React.PropsWithChildren {
    environmentId: string;
}

const DeploymentGate: React.FC<DeploymentGateProps> = ({ children, environmentId }) => {
    const deploymentApi = useDeploymentsApi();

    const deploymentQuery = useQuery({
        queryKey: ['deployment', environmentId],
        queryFn: () => deploymentApi.getDeployments(environmentId),
        enabled: !!environmentId,
    });
    return (
        <ApiDataFetcher
            queries={[deploymentQuery]}
        >
            {deploymentQuery?.data?.length !== 0 ? (
                <div>
                    {children}
                </div>
            ) : (
                <Card>
                    No deployments found
                </Card>
            )}
        </ApiDataFetcher>
    )
}

export default DeploymentGate
