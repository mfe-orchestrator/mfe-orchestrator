import React from "react"
import EnvironmentSelector from "../../components/environment/EnvironmentSelector"
import useProjectStore from "@/store/useProjectStore"
import DeploymentList from "./DeploymentList"
import EnvironmentsGate from "@/theme/EnvironmentsGate"
import { Button } from "@/components/ui/button"
import useDeploymentsApi from "@/hooks/apiClients/useDeploymentsApi"
import { useQueryClient } from "@tanstack/react-query"

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
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                    <h2 className="text-3xl font-bold tracking-tight">{projectStore.project?.name}</h2>
                    {isThereAtLeastOneEnvironment && (
                        <EnvironmentSelector selectedEnvironment={projectStore.environment} environments={projectStore.environments} onEnvironmentChange={projectStore.setEnvironment} />
                    )}
                    <Button onClick={handleDeploy}>Deploy</Button>
                </div>
            </div>
            <EnvironmentsGate>
                <DeploymentList environmentId={projectStore.environment?._id} />
            </EnvironmentsGate>
        </div>
    )
}

export default DeploymentDashboard
