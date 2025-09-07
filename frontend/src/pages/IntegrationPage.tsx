import ApiDataFetcher from "@/components/ApiDataFetcher/ApiDataFetcher"
import DeploymentGate from "@/components/DeploymentGate"
import EnvironmentSelector from "@/components/environment/EnvironmentSelector"
import SinglePageLayout from "@/components/SinglePageLayout"
import { Card } from "@/components/ui/card"
import { TabsContent } from "@/components/ui/tabs/partials/tabsContent/tabsContent"
import { TabsList } from "@/components/ui/tabs/partials/tabsList/tabsList"
import { TabsTrigger } from "@/components/ui/tabs/partials/tabsTrigger/tabsTrigger"
import { Tabs } from "@/components/ui/tabs/tabs"
import useServeApi, { IServeMicrofronted } from "@/hooks/apiClients/useServeApi"
import useProjectStore from "@/store/useProjectStore"
import EnvironmentsGate from "@/theme/EnvironmentsGate"
import { useQuery } from "@tanstack/react-query"
import React, { useState } from "react"

const getViteConfig = (microfrontends: IServeMicrofronted[]) => {
    // Generate remotes object from microfrontends array
    console.log("microfrontends", microfrontends)
    if (!microfrontends) return
    const remotes = microfrontends.reduce((acc, mfe, index) => {
        const name = mfe?.slug?.replace(/\//g, "_").replace(/-/g, "") || `mfe${index + 1}`
        acc[name] = mfe.url
        return acc
    }, {} as Record<string, string>)

    // Generate remotes string with proper indentation
    const remotesString = Object.entries(remotes)
        .map(([key, value]) => `        ${key}: '${value}'`)
        .join(",\n")

    const viteConfig = `// vite.config.js
import { defineConfig } from 'vite';
import federation from '@originjs/vite-plugin-federation';

export default defineConfig({
  plugins: [
    federation({
      name: 'host-app',
      filename: 'remoteEntry.js',
      remotes: {
${remotesString}
      },
      shared: ['react', 'react-dom', 'react-router-dom']
    })
  ],
  build: {
    target: 'esnext',
    minify: false,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        minifyInternalExports: false
      }
    }
  }
});`

    return viteConfig
}

const getWebpackConfig = (microfrontends: IServeMicrofronted[]) => {
    if (!microfrontends) return ""

    // Generate remotes string with proper formatting
    const remotesString = microfrontends
        .map((mfe, index) => {
            const name = mfe?.slug?.replace(/\//g, "_").replace(/-/g, "") || `mfe${index + 1}`
            const url = mfe.url
            return `        '${name}': '${name}@${url}'`
        })
        .join(",\n")

    return `// webpack.config.js
const { ModuleFederationPlugin } = require('webpack').container;

module.exports = {
  // ... other webpack config
  plugins: [
    new ModuleFederationPlugin({
      name: 'host',
      filename: 'remoteEntry.js',
      remotes: {
${remotesString}
      },
      shared: {
        react: { 
          singleton: true,
          requiredVersion: '^18.2.0',
          eager: true
        },
        'react-dom': { 
          singleton: true,
          requiredVersion: '^18.2.0',
          eager: true
        },
        'react-router-dom': {
          singleton: true,
          requiredVersion: '^6.15.0',
          eager: true
        }
      },
    }),
  ],
};`
}

const FrontendIntegration = ({ microfrontends, environmentId }: { microfrontends: IServeMicrofronted[], environmentId?: string }) => {
    const [activeTab, setActiveTab] = useState("vite")
    const curlExample = `# Example CURL request to fetch a remote module
  curl -X GET https://${window.location.host}/api/serve/all/${environmentId}`

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold">Frontend Integration</h2>
            <p className="text-muted-foreground">
                Follow the instructions below to integrate microfrontends using your preferred method.
            </p>
            
            <Card>
                <Tabs value={activeTab} onValueChange={setActiveTab} tabsListPosition="fullWidth">
                    <TabsList>
                        <TabsTrigger value="vite">Vite</TabsTrigger>
                        <TabsTrigger value="webpack">Webpack</TabsTrigger>
                        <TabsTrigger value="curl">CURL</TabsTrigger>
                    </TabsList>

                    <TabsContent value="vite" className="p-6">
                        <h3 className="text-xl font-semibold mb-4">Vite Module Federation Setup</h3>
                        <p className="mb-4">To integrate using Vite Module Federation, first install the required plugin:</p>
                        <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded-md overflow-x-auto text-sm mb-6">
                            <code>npm install @originjs/vite-plugin-federation --save-dev</code>
                        </pre>
                        <p className="mb-4">Then, update your Vite configuration:</p>
                        <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded-md overflow-x-auto text-sm">
                            <code>{getViteConfig(microfrontends)}</code>
                        </pre>
                    </TabsContent>

                    <TabsContent value="webpack" className="p-6">
                        <h3 className="text-xl font-semibold mb-4">Webpack Module Federation Setup</h3>
                        <p className="mb-4">For Webpack Module Federation, ensure you have Webpack 5 installed. Then configure your webpack config:</p>
                        <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded-md overflow-x-auto text-sm">
                            <code>{getWebpackConfig(microfrontends)}</code>
                        </pre>
                    </TabsContent>

                    <TabsContent value="curl" className="p-6">
                        <h3 className="text-xl font-semibold mb-4">Direct API Access via CURL</h3>
                        <p className="mb-4">You can also interact with our API directly using CURL:</p>
                        <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded-md overflow-x-auto text-sm mb-6">
                            <code>{curlExample}</code>
                        </pre>
                        <p className="mb-2">Here is the preview:</p>
                        <div className="border rounded-md overflow-hidden">
                            <iframe 
                                src={`https://${window.location.host}/api/serve/all/${environmentId}`} 
                                className="w-full h-[500px] border-0"
                                title="API Response Preview"
                            />
                        </div>
                    </TabsContent>
                </Tabs>
            </Card>
        </div>
    )
}

const EnvironmentVariablesIntegration = ({ environmentId }: { environmentId?: string }) => {
    const envVarsUrl = environmentId 
        ? `https://${window.location.host}/api/serve/global-variables/${environmentId}`
        : ''

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold">Environment Variables Integration</h2>
            <p className="text-muted-foreground">
                Access your environment variables in your microfrontends using the following methods:
            </p>
            
            <Card className="p-6">
                <h3 className="text-xl font-semibold mb-4">JavaScript Integration</h3>
                <p className="mb-4">
                    Include this script in your HTML to make environment variables available as <code>window.globalConfig</code>:
                </p>
                <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded-md overflow-x-auto text-sm mb-6">
                    <code>{`<script src="${envVarsUrl}/index.js"></script>`}</code>
                </pre>
                
                <h4 className="text-lg font-semibold mt-6 mb-3">Usage Example</h4>
                <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded-md overflow-x-auto text-sm">
                    <code>{
`// Access environment variables like this:
const apiUrl = window.globalConfig?.API_URL;
const featureFlag = window.globalConfig?.ENABLE_FEATURE;

// Use them in your application
if (featureFlag) {
    // Feature is enabled
    fetch(apiUrl + '/data').then(/* ... */);
}`}
                    </code>
                </pre>
                
                <h3 className="text-xl font-semibold mt-8 mb-4">Direct API Access</h3>
                <p className="mb-2">Fetch variables directly from the API:</p>
                <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded-md overflow-x-auto text-sm">
                    <code>{
`fetch('${envVarsUrl}')
  .then(response => response.json())
  .then(data => {
    console.log(data);
  });
`}
                    </code>
                </pre>
            </Card>
        </div>
    )
}

const IntegrationPage: React.FC = () => {
    const projectStore = useProjectStore()
    const serveApi = useServeApi()
    const isThereAtLeastOneEnvironment = projectStore.environments?.length > 0
    const [activeSection, setActiveSection] = useState("frontend")

    const microfrontendQuery = useQuery({
        queryKey: ["all-data-serve", projectStore.environment?._id],
        queryFn: () => serveApi.getAll(projectStore.environment?._id),
        enabled: !!projectStore.environment?._id
    })

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
                    <ApiDataFetcher queries={[microfrontendQuery]}>
                        <div className="container mx-auto p-4 max-w-4xl space-y-8">
                            <Tabs value={activeSection} onValueChange={setActiveSection} className="w-full" tabsListPosition="fullWidth">
                                <TabsList className="grid w-full grid-cols-2">
                                    <TabsTrigger value="frontend">Frontend Integration</TabsTrigger>
                                    <TabsTrigger value="env-vars">Environment Variables</TabsTrigger>
                                </TabsList>

                                <TabsContent value="frontend" className="mt-6">
                                    <FrontendIntegration microfrontends={microfrontendQuery.data?.microfrontends || []} environmentId={projectStore.environment?._id} />
                                </TabsContent>

                                <TabsContent value="env-vars" className="mt-6">
                                    <EnvironmentVariablesIntegration environmentId={projectStore.environment?._id} />
                                </TabsContent>
                            </Tabs>
                        </div>
                    </ApiDataFetcher>
                </DeploymentGate>
            </EnvironmentsGate>
        </SinglePageLayout>
    )
}

export default IntegrationPage
