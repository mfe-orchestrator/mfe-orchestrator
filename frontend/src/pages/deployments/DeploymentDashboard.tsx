import React from "react"
import EnvironmentSelector from "../../components/environment/EnvironmentSelector"
import useProjectStore from "@/store/useProjectStore"
import DeploymentList from "./DeploymentList"
import EnvironmentsGate from "@/theme/EnvironmentsGate"
import { Button } from "@/components/ui/button/button"
import useDeploymentsApi from "@/hooks/apiClients/useDeploymentsApi"
import { useQueryClient } from "@tanstack/react-query"
import SinglePageLayout from "@/components/SinglePageLayout"

const DeploymentDashboard: React.FC = () => {
    const projectStore = useProjectStore()
    const deploymentsApi = useDeploymentsApi()
    const queryClient = useQueryClient()

    const isThereAtLeastOneEnvironment = projectStore.environments?.length > 0

    const handleDeploy = async () => {
        await deploymentsApi.createDeployment([projectStore.environment?._id])
        await queryClient.invalidateQueries({ queryKey: ["deployments", projectStore.environment?._id] })
    }

    return (
        <SinglePageLayout
            title="Deployments"
            description="Gestisci i deployment del tuo progetto"
            center={isThereAtLeastOneEnvironment && (
                <EnvironmentSelector selectedEnvironment={projectStore.environment} environments={projectStore.environments} onEnvironmentChange={projectStore.setEnvironment} />
            )}
            right={
                <Button onClick={handleDeploy}>Deploy</Button>
            }
        >
            <EnvironmentsGate>
                <DeploymentList environmentId={projectStore.environment?._id} />
            </EnvironmentsGate>
        </SinglePageLayout>
    )
}

export default DeploymentDashboard
