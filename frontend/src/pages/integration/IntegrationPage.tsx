import ApiDataFetcher from "@/components/ApiDataFetcher/ApiDataFetcher"
import DeploymentGate from "@/components/DeploymentGate"
import EnvironmentSelector from "@/components/environment/EnvironmentSelector"
import SinglePageLayout from "@/components/SinglePageLayout"
import { TabsContent } from "@/components/ui/tabs/partials/tabsContent/tabsContent"
import { TabsList } from "@/components/ui/tabs/partials/tabsList/tabsList"
import { TabsTrigger } from "@/components/ui/tabs/partials/tabsTrigger/tabsTrigger"
import { Tabs } from "@/components/ui/tabs/tabs"
import useServeApi, { IServeMicrofrontend } from "@/hooks/apiClients/useServeApi"
import useProjectStore from "@/store/useProjectStore"
import EnvironmentsGate from "@/theme/EnvironmentsGate"
import { useQuery } from "@tanstack/react-query"
import React, { useState } from "react"
import EnvironmentVariablesIntegration from "./partials/EnvironmentVariablesIntegration"
import FrontendIntegration from "./partials/FrontendIntegration"
import MicrofrontendSelector from "@/components/environment/MicrofrontendSelector"
import useMicrofrontendsApi, { Microfrontend } from "@/hooks/apiClients/useMicrofrontendsApi"
import useDeploymentsApi from "@/hooks/apiClients/useDeploymentsApi"

const IntegrationPage: React.FC = () => {
    const projectStore = useProjectStore()
    const deploymentApi = useDeploymentsApi()
    const isThereAtLeastOneEnvironment = projectStore.environments?.length > 0
    const [activeSection, setActiveSection] = useState("frontend")

    const deploymentQuery = useQuery({
        queryKey: ["deployment", projectStore.environment?._id],
        queryFn: () => deploymentApi.getLastDeployment(projectStore.environment?._id),
        enabled: !!projectStore.environment?._id
    })

    console.log("Midsf", deploymentQuery.data?.microfrontends)

    return (
        <SinglePageLayout
            title="Integration Guide"
            description="Follow the instructions below to integrate with our platform."
            left={
                isThereAtLeastOneEnvironment && (
                    <EnvironmentSelector selectedEnvironment={projectStore.environment} environments={projectStore.environments} onEnvironmentChange={projectStore.setEnvironment} />
                )
            }
        >
            <EnvironmentsGate>
                <DeploymentGate environmentId={projectStore.environment?._id}>
                    <ApiDataFetcher queries={[deploymentQuery]}>
                        {!deploymentQuery.data ?
                            <p>No deployment found</p> :
                            <Tabs value={activeSection} onValueChange={setActiveSection} tabsListPosition="fullWidth">
                                <TabsList>
                                    <TabsTrigger value="frontend" className="flex-1">
                                        Frontend Integration
                                    </TabsTrigger>
                                    <TabsTrigger value="env-vars" className="flex-1">
                                        Environment Variables
                                    </TabsTrigger>
                                </TabsList>

                                <TabsContent value="frontend">
                                    <FrontendIntegration deployment={deploymentQuery.data} />
                                </TabsContent>

                                <TabsContent value="env-vars">
                                    <EnvironmentVariablesIntegration environmentId={projectStore.environment?._id} />
                                </TabsContent>
                            </Tabs>
                        }
                    </ApiDataFetcher>
                </DeploymentGate>
            </EnvironmentsGate>
        </SinglePageLayout>
    )
}

export default IntegrationPage
