import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { TabsContent } from "@/components/ui/tabs/partials/tabsContent/tabsContent"
import { TabsList } from "@/components/ui/tabs/partials/tabsList/tabsList"
import { TabsTrigger } from "@/components/ui/tabs/partials/tabsTrigger/tabsTrigger"
import { Tabs } from "@/components/ui/tabs/tabs"
import { IServeMicrofronted } from "@/hooks/apiClients/useServeApi"
import { useState } from "react"

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
        .map(([key, value]) => `${key}: '${value}'`)
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

const FrontendIntegration = ({ microfrontends, environmentId }: { microfrontends: IServeMicrofronted[]; environmentId?: string }) => {
    const [activeTab, setActiveTab] = useState("vite")
    const curlExample = `# Example CURL request to fetch a remote module
  curl -X GET https://${window.location.host}/api/serve/all/${environmentId}`

    return (
        <div>
            <Card>
                <CardHeader className="pb-6 border-none">
                    <h2 className="text-xl font-semibold">Frontend Integration</h2>
                    <p>Follow the instructions below to integrate microfrontends using your preferred method.</p>
                </CardHeader>

                <CardContent>
                    <Tabs value={activeTab} onValueChange={setActiveTab} tabsListPosition="fullWidth">
                        <TabsList>
                            <TabsTrigger value="vite">Vite</TabsTrigger>
                            <TabsTrigger value="webpack">Webpack</TabsTrigger>
                            <TabsTrigger value="curl">CURL</TabsTrigger>
                        </TabsList>

                        <TabsContent value="vite">
                            <h3 className="text-lg font-semibold">Vite Module Federation Setup</h3>
                            <p className="mb-4">To integrate using Vite Module Federation, first install the required plugin:</p>
                            <pre className="bg-muted p-4 rounded-md overflow-x-auto text-sm mb-4">
                                <code>npm install @originjs/vite-plugin-federation --save-dev</code>
                            </pre>
                            <p className="mb-4">Then, update your Vite configuration:</p>
                            <pre className="bg-muted p-4 rounded-md overflow-x-auto text-sm">
                                <code>{getViteConfig(microfrontends)}</code>
                            </pre>
                        </TabsContent>

                        <TabsContent value="webpack">
                            <h3 className="text-lg font-semibold">Webpack Module Federation Setup</h3>
                            <p className="mb-4">For Webpack Module Federation, ensure you have Webpack 5 installed. Then configure your webpack config:</p>
                            <pre className="bg-muted p-4 rounded-md overflow-x-auto text-sm">
                                <code>{getWebpackConfig(microfrontends)}</code>
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
                                <iframe src={`https://${window.location.host}/api/serve/all/${environmentId}`} className="w-full h-[500px] border-0" title="API Response Preview" />
                            </div>
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
        </div>
    )
}

export default FrontendIntegration
