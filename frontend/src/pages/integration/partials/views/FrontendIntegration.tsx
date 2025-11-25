import MicrofrontendSelector from "@/pages/integration/partials/components/MicrofrontendSelector";
import { CodeIntegration } from "../index";
import { Button } from "@/components/atoms";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { TabsContent } from "@/components/ui/tabs/partials/tabsContent/tabsContent";
import { TabsList } from "@/components/ui/tabs/partials/tabsList/tabsList";
import { TabsTrigger } from "@/components/ui/tabs/partials/tabsTrigger/tabsTrigger";
import { Tabs } from "@/components/ui/tabs/tabs";
import { DeploymentDTO } from "@/hooks/apiClients/useDeploymentsApi";
import { Microfrontend } from "@/hooks/apiClients/useMicrofrontendsApi";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import useIntegrationApi from "@/hooks/apiClients/useIntegrationApi";
import { useMutation } from "@tanstack/react-query";
import useToastNotificationStore from "@/store/useToastNotificationStore";

export const FrontendIntegration = ({ deployment }: { deployment: DeploymentDTO }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("vite");
  const integrationApi = useIntegrationApi();
  const notification = useToastNotificationStore();
  const activeDeployment =
    deployment instanceof Array ? deployment.find((d) => d.active) : deployment;

  const curlExample = `# Example CURL request to fetch a remote module
  curl -X GET https://${window.location.host}/api/serve/all/${activeDeployment.environmentId}`;

  const [selectedMicrofrontend, setSelectedMicrofrontend] = useState<Microfrontend>(
    activeDeployment.microfrontends[0],
  );

  const injectInRepositoryMutation = useMutation({
    mutationFn: integrationApi.injectRemotesInHost,
  });

  const injectInRepository = async () => {
    await injectInRepositoryMutation.mutateAsync({
      microfrontendId: selectedMicrofrontend._id,
      environmentId: activeDeployment.environmentId,
    });

    notification.showSuccessNotification({
      message: "Remotes injected successfully",
    });
  };

  return (
    <Card>
      <CardHeader className="border-none">
        <h2 className="text-xl font-semibold">{t("integration.fe_integration_tab.title")}</h2>
        <p>{t("integration.fe_integration_tab.description")}</p>
      </CardHeader>

      <CardContent>
        <div className="flex gap-2 flex-wrap items-end mb-4">
          <MicrofrontendSelector
            microfrontends={activeDeployment.microfrontends}
            selectedMicrofrontend={selectedMicrofrontend}
            onSelect={setSelectedMicrofrontend}
          />
          <Button
            onClick={injectInRepository}
            disabled={!selectedMicrofrontend || injectInRepositoryMutation.isPending}>
            Inject in Repository
          </Button>
        </div>

        {selectedMicrofrontend ? (
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            tabsListPosition="fullWidth">
            <TabsList>
              <TabsTrigger
                className="flex-[1_1_120px]"
                value="vite">
                Vite
              </TabsTrigger>
              <TabsTrigger
                className="flex-[1_1_120px]"
                value="webpack">
                Webpack
              </TabsTrigger>
              <TabsTrigger
                className="flex-[1_1_120px]"
                value="curl">
                CURL
              </TabsTrigger>
            </TabsList>

            <TabsContent value="vite">
              <h3 className="text-lg font-semibold">
                {t("integration.fe_integration_tab.vite.title")}
              </h3>
              <p className="mb-4">{t("integration.fe_integration_tab.vite.description")}</p>
              <pre className="bg-muted p-4 rounded-md overflow-x-auto text-sm mb-4">
                <code>npm install @originjs/vite-plugin-federation --save-dev</code>
              </pre>
              <p className="mb-4">{t("integration.fe_integration_tab.vite.step2")}</p>
              <pre className="bg-muted p-4 rounded-md overflow-x-auto text-sm">
                <CodeIntegration
                  framework="vite"
                  microfrontendId={selectedMicrofrontend._id}
                  deploymentId={activeDeployment._id}
                />
              </pre>
            </TabsContent>

            <TabsContent value="webpack">
              <h3 className="text-lg font-semibold">
                {t("integration.fe_integration_tab.webpack.title")}
              </h3>
              <p className="mb-4">{t("integration.fe_integration_tab.webpack.description")}</p>
              <pre className="bg-muted p-4 rounded-md overflow-x-auto text-sm">
                <CodeIntegration
                  framework="webpack"
                  microfrontendId={selectedMicrofrontend._id}
                  deploymentId={activeDeployment._id}
                />
              </pre>
            </TabsContent>

            <TabsContent value="curl">
              <h3 className="text-lg font-semibold">
                {t("integration.fe_integration_tab.curl.title")}
              </h3>
              <p className="mb-4">{t("integration.fe_integration_tab.curl.description")}</p>
              <pre className="bg-muted p-4 rounded-md overflow-x-auto text-sm mb-4">
                <code>{curlExample}</code>
              </pre>
              <p className="mb-4">{t("integration.fe_integration_tab.curl.step2")}</p>
              <div className="border-2 border-border rounded-md overflow-hidden">
                <iframe
                  src={`https://${window.location.host}/api/serve/all/${activeDeployment.environmentId}`}
                  className="w-full h-[500px] border-0"
                  title="API Response Preview"
                />
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          <p>No microfrontend selected</p>
        )}
      </CardContent>
    </Card>
  );
};

export default FrontendIntegration;
