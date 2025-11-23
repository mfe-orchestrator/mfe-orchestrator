import SinglePageLayout from "@/components/SinglePageLayout"
import { Button } from "@/components/ui/button/button"
import useDeploymentsApi from "@/hooks/apiClients/useDeploymentsApi"
import useProjectStore from "@/store/useProjectStore"
import EnvironmentsGate from "@/theme/EnvironmentsGate"
import { useQueryClient } from "@tanstack/react-query"
import { Rocket } from "lucide-react"
import React from "react"
import EnvironmentSelector from "../../components/molecules/EnvironmentSelector"
import DeploymentList from "./partials/DeploymentList"
import { useTranslation } from "react-i18next"

export const Deployments: React.FC = () => {
    const { t } = useTranslation()
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
            title={t("deployments.title")}
            description={t("deployments.subtitle")}
            left={
                <div className="w-full flex items-end gap-y-2 gap-x-4 flex-wrap">
                    {isThereAtLeastOneEnvironment && (
                        <>
                            <EnvironmentSelector selectedEnvironment={projectStore.environment} environments={projectStore.environments} onEnvironmentChange={projectStore.setEnvironment} />
                            <Button className="min-w-32" onClick={handleDeploy}>
                                <Rocket />
                                {t("deployments.deploy_button")}
                            </Button>
                        </>
                    )}
                </div>
            }
            lrContainerClassname="items-end"
        >
            <EnvironmentsGate>
                <DeploymentList environmentId={projectStore.environment?._id} />
            </EnvironmentsGate>
        </SinglePageLayout>
    )
}

export default Deployments
