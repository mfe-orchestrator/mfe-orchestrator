import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Rocket } from "lucide-react"
import React from "react"
import { useTranslation } from "react-i18next"
import AskAssistantButton from "@/components/assistant/AskAssistantButton"
import { Button } from "@/components/atoms"
import SinglePageLayout from "@/components/SinglePageLayout"
import useDeploymentsApi from "@/hooks/apiClients/useDeploymentsApi"
import useProjectStore from "@/store/useProjectStore"
import EnvironmentsGate from "@/theme/EnvironmentsGate"
import EnvironmentSelector from "../../components/molecules/EnvironmentSelector"
import DeploymentList from "./partials/DeploymentList"

export const Deployments: React.FC = () => {
    const { t } = useTranslation()
    const projectStore = useProjectStore()
    const deploymentsApi = useDeploymentsApi()
    const queryClient = useQueryClient()

    const isThereAtLeastOneEnvironment = projectStore.environments?.length > 0

    // With GitOps on the deploy commits to the repositories first, and takes a while
    const deployMutation = useMutation({
        mutationFn: (environmentId: string) => deploymentsApi.createDeployment([environmentId]),
        onSuccess: (_deployment, environmentId) => queryClient.invalidateQueries({ queryKey: ["deployments", environmentId] })
    })

    return (
        <SinglePageLayout
            title={t("deployments.title")}
            description={t("deployments.subtitle")}
            left={
                <div className="w-full flex items-end gap-y-2 gap-x-4 flex-wrap">
                    {isThereAtLeastOneEnvironment && (
                        <>
                            <EnvironmentSelector selectedEnvironment={projectStore.environment} environments={projectStore.environments} onEnvironmentChange={projectStore.setEnvironment} />
                            <Button
                                className="min-w-32"
                                onClick={() => deployMutation.mutate(projectStore.environment?._id)}
                                disabled={!projectStore.environment?._id}
                                loading={deployMutation.isPending}
                                loadingLabel={t("deployments.deploying")}
                            >
                                <Rocket />
                                {t("deployments.deploy_button")}
                            </Button>
                            {projectStore.environment?._id && (
                                <AskAssistantButton
                                    label={t("assistant.actions.analyze_deployments")}
                                    question={t("assistant.questions.analyze_deployments", { environment: projectStore.environment.name, environmentId: projectStore.environment._id })}
                                    dataTestId="assistant-analyze-deployments"
                                />
                            )}
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
