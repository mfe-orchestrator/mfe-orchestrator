import React, { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import useProjectStore from '@/store/useProjectStore';
import { Badge } from '@/components/ui/badge';
import useServeApi, { IServeMicrofronted } from '@/hooks/apiClients/useServeApi';
import { useQuery } from '@tanstack/react-query';
import ApiDataFetcher from '@/components/ApiDataFetcher/ApiDataFetcher';


const getViteConfig = (microfrontends: IServeMicrofronted[]) => {
  // Generate remotes object from microfrontends array
  if(!microfrontends) return
  const remotes = microfrontends.reduce((acc, mfe, index) => {
    const name = mfe?.slug?.replace(/\//g, '_') || `mfe${index + 1}`;
    acc[name] = (mfe.url.endsWith('/') ? mfe.url : `${mfe.url}/`) + "index.js";
    return acc;
  }, {} as Record<string, string>);

  // Generate remotes string with proper indentation
  const remotesString = Object.entries(remotes)
    .map(([key, value]) => `${key}: '${value}'`)
    .join(',\n');

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
});`;

  return viteConfig;
}

const getWebpackConfig = (microfrontends: IServeMicrofronted[]) => {
  if (!microfrontends) return '';
  
  // Generate remotes string with proper formatting
  const remotesString = microfrontends
    .map((mfe, index) => {
      const name = mfe?.slug?.replace(/\//g, '_') || `mfe${index + 1}`;
      const url = mfe.url.endsWith('/') ? mfe.url : `${mfe.url}/`;
      return `        '${name}': '${name}@${url}remoteEntry.js'`;
    })
    .join(',\n');

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
};`;
}

const IntegrationPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('vite');
  const projectStore = useProjectStore();
  const serveApi = useServeApi();

  const microfrontendQuery = useQuery({
    queryKey: ['all-data-serve', projectStore.environment?._id],
    queryFn: () => serveApi.getAll(projectStore.environment?._id),
    enabled: !!projectStore.environment?._id,
  });

  const curlExample = `# Example CURL request to fetch a remote module
  curl -X GET http://${window.location.host}/api/serve/all/${projectStore.environment?._id}`;

  return (
    <ApiDataFetcher 
      queries={[microfrontendQuery]}
    >
    <div className="container mx-auto p-4 max-w-4xl">
      <h1 className="text-2xl font-bold mb-4">Integration Guide</h1>
      {projectStore.environment &&
        <p className="mb-6">
            Environment : <Badge variant="outline" style={{ backgroundColor: projectStore.environment.color }} >{projectStore.environment.slug}</Badge>
        </p>
    }
      <p className="mb-6">
        Follow the instructions below to integrate with our platform using your preferred method.
      </p>
      
      
      <Card className="p-4">
        <Tabs 
          value={activeTab} 
          onValueChange={setActiveTab}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="vite">Vite</TabsTrigger>
            <TabsTrigger value="webpack">Webpack</TabsTrigger>
            <TabsTrigger value="curl">CURL</TabsTrigger>
          </TabsList>
          
          <TabsContent value="vite" className="space-y-4">
            <h2 className="text-xl font-semibold">Vite Module Federation Setup</h2>
            <p>To integrate using Vite Module Federation, first install the required plugin:</p>
            <pre className="bg-gray-100 p-4 rounded-md overflow-x-auto text-sm">
              <code>npm install @originjs/vite-plugin-federation --save-dev</code>
            </pre>
            <p>Then, update your Vite configuration:</p>
            <pre className="bg-gray-100 p-4 rounded-md overflow-x-auto text-sm">
              <code>{getViteConfig(microfrontendQuery.data?.microfrontends)}</code>
            </pre>
          </TabsContent>
          
          <TabsContent value="webpack" className="space-y-4">
            <h2 className="text-xl font-semibold">Webpack Module Federation Setup</h2>
            <p>For Webpack Module Federation, ensure you have Webpack 5 installed. Then configure your webpack config:</p>
            <pre className="bg-gray-100 p-4 rounded-md overflow-x-auto text-sm">
              <code>{getWebpackConfig(microfrontendQuery.data?.microfrontends)}</code>
            </pre>
          </TabsContent>
          
          <TabsContent value="curl" className="space-y-4">
            <h2 className="text-xl font-semibold">Direct API Access via CURL</h2>
            <p>You can also interact with our API directly using CURL:</p>
            <pre className="bg-gray-100 p-4 rounded-md overflow-x-auto text-sm">
              <code>{curlExample}</code>
            </pre>
            <p>Here is the preview</p>
              <iframe src={`http://${window.location.host}/api/serve/all/${projectStore.environment?._id}`} width="100%" height="500px" /> 
          </TabsContent>
        </Tabs>
      </Card>
    </div>
    </ApiDataFetcher>
  );
};

export default IntegrationPage;