import MicrofrontendSelector from "@/components/environment/MicrofrontendSelector"
import CodeIntegration from "@/components/integration/CodeIntegration"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { TabsContent } from "@/components/ui/tabs/partials/tabsContent/tabsContent"
import { TabsList } from "@/components/ui/tabs/partials/tabsList/tabsList"
import { TabsTrigger } from "@/components/ui/tabs/partials/tabsTrigger/tabsTrigger"
import { Tabs } from "@/components/ui/tabs/tabs"
import { DeploymentDTO } from "@/hooks/apiClients/useDeploymentsApi"
import { Microfrontend } from "@/hooks/apiClients/useMicrofrontendsApi"
import { useState } from "react"

const FrontendIntegration = ({ deployment }: { deployment: DeploymentDTO }) => {
  const [activeTab, setActiveTab] = useState("vite")
  const activeDeployment = deployment instanceof Array ? deployment.find(d => d.active) : deployment

  const curlExample = `# Example CURL request to fetch a remote module
  curl -X GET https://${window.location.host}/api/serve/all/${activeDeployment.environmentId}`

  const [selectedMicrofrontend, setSelectedMicrofrontend] = useState<Microfrontend>(activeDeployment.microfrontends[0]);

  return (
    <Card>
      <CardHeader className="border-none">
        <h2 className="text-xl font-semibold">Frontend Integration</h2>
        <p>Follow the instructions below to integrate microfrontends using your preferred method.</p>
      </CardHeader>

      <CardContent>
        <MicrofrontendSelector microfrontends={activeDeployment.microfrontends} selectedMicrofrontend={selectedMicrofrontend} onSelect={setSelectedMicrofrontend} />

        {selectedMicrofrontend ? (
          <Tabs value={activeTab} onValueChange={setActiveTab} tabsListPosition="fullWidth">
            <TabsList>
              <TabsTrigger className="flex-[1_1_120px]" value="vite">
                Vite
              </TabsTrigger>
              <TabsTrigger className="flex-[1_1_120px]" value="webpack">
                Webpack
              </TabsTrigger>
              <TabsTrigger className="flex-[1_1_120px]" value="curl">
                CURL
              </TabsTrigger>
            </TabsList>

            <TabsContent value="vite">
              <h3 className="text-lg font-semibold">Vite Module Federation Setup</h3>
              <p className="mb-4">To integrate using Vite Module Federation, first install the required plugin:</p>
              <pre className="bg-muted p-4 rounded-md overflow-x-auto text-sm mb-4">
                <code>npm install @originjs/vite-plugin-federation --save-dev</code>
              </pre>
              <p className="mb-4">Then, update your Vite configuration:</p>
              <pre className="bg-muted p-4 rounded-md overflow-x-auto text-sm">
                <CodeIntegration
                  framework="vite"
                  microfrontendId={selectedMicrofrontend._id}
                  deploymentId={activeDeployment._id}
                />
              </pre>
            </TabsContent>

            <TabsContent value="webpack">
              <h3 className="text-lg font-semibold">Webpack Module Federation Setup</h3>
              <p className="mb-4">For Webpack Module Federation, ensure you have Webpack 5 installed. Then configure your webpack config:</p>
              <pre className="bg-muted p-4 rounded-md overflow-x-auto text-sm">
                <CodeIntegration
                  framework="webpack"
                  microfrontendId={selectedMicrofrontend._id}
                  deploymentId={activeDeployment._id}
                />
              </pre>
            </TabsContent>

            <TabsContent value="curl">
              <h3 className="text-lg font-semibold">Direct API Access via CURL</h3>
              <p className="mb-4">You can also interact with our API directly using CURL:</p>
              <pre className="bg-muted p-4 rounded-md overflow-x-auto text-sm mb-4">
                <code>{curlExample}</code>
              </pre>
              <p className="mb-4">Here is the preview:</p>
              <div className="border-2 border-border rounded-md overflow-hidden">
                <iframe src={`https://${window.location.host}/api/serve/all/${activeDeployment.environmentId}`} className="w-full h-[500px] border-0" title="API Response Preview" />
              </div>
            </TabsContent>
          </Tabs>
      ) : (
        <p>No microfrontend selected</p>
      )}
      </CardContent>
    </Card >
  )
}

export default FrontendIntegration
