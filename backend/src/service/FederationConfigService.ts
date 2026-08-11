import { MicrofrontendCompiler, MicrofrontendFramework } from "../types/MicrofrontendStack"

/** The package a host imports remoteUrl() and configure() from */
export const CLIENT_SDK_PACKAGE = "@mfe-orchestrator-hub/client"

export interface FederationRemote {
    /** Federation-safe name the host imports from */
    name: string
    /** Slug the SDK resolves the url of, never a url: the backend decides which version is served */
    slug: string
}

/**
 * What a framework contributes to a bundler config: the plugin that compiles it, the packages
 * that must be shared with the remotes to avoid loading two copies of the framework, and where
 * its entry point and root component live.
 *
 * Taken from the marketplace templates, which are the reference integration for each stack.
 */
interface FrameworkProfile {
    /** Import line of the framework's vite plugin */
    vitePluginImport?: string
    /** Call of that plugin inside the plugins array */
    vitePluginCall?: string
    /** Extra top level keys the framework needs in vite.config */
    viteExtras?: string
    /** Import lines webpack needs, beyond webpack itself */
    webpackImports?: string[]
    /** Plugin instances webpack needs before ModuleFederationPlugin */
    webpackPlugins?: string[]
    /** module.rules entries the framework's file types need */
    webpackRules?: string[]
    /** resolve.extensions the framework's file types need */
    webpackExtensions?: string[]
    /**
     * Packages shared with the remotes. Deliberately the framework core only: sharing a package
     * the app does not depend on fails the build, and no requiredVersion is pinned so federation
     * reads the range out of the app's own package.json.
     */
    shared: string[]
    /** Root component a host exposes, so it can itself be consumed as a remote */
    exposedComponent: string
    /** File the bootstrap snippet has to be pasted at the top of */
    entryPoint: string
}

const FRAMEWORK_PROFILES: Record<MicrofrontendFramework, FrameworkProfile> = {
    [MicrofrontendFramework.REACT]: {
        vitePluginImport: "import react from '@vitejs/plugin-react'",
        vitePluginCall: "react()",
        webpackImports: ["const HtmlWebpackPlugin = require('html-webpack-plugin');"],
        webpackPlugins: ["new HtmlWebpackPlugin({ template: './public/index.html' })"],
        webpackRules: [String.raw`{ test: /\.[jt]sx?$/, exclude: /node_modules/, use: 'babel-loader' }`, String.raw`{ test: /\.css$/, use: ['style-loader', 'css-loader'] }`],
        webpackExtensions: ["'.js'", "'.jsx'", "'.ts'", "'.tsx'"],
        shared: ["react", "react-dom"],
        exposedComponent: "'./App': './src/App'",
        entryPoint: "src/main.tsx"
    },
    [MicrofrontendFramework.VUE]: {
        vitePluginImport: "import vue from '@vitejs/plugin-vue'",
        vitePluginCall: "vue()",
        webpackImports: ["const HtmlWebpackPlugin = require('html-webpack-plugin');", "const { VueLoaderPlugin } = require('vue-loader');"],
        webpackPlugins: ["new HtmlWebpackPlugin({ template: './public/index.html' })", "new VueLoaderPlugin()"],
        webpackRules: [String.raw`{ test: /\.vue$/, loader: 'vue-loader' }`, String.raw`{ test: /\.css$/, use: ['style-loader', 'css-loader'] }`],
        webpackExtensions: ["'.js'", "'.vue'", "'.json'"],
        shared: ["vue"],
        exposedComponent: "'./App': './src/App.vue'",
        entryPoint: "src/main.js"
    },
    [MicrofrontendFramework.ANGULAR]: {
        vitePluginImport: "import angular from '@analogjs/vite-plugin-angular'",
        vitePluginCall: "angular()",
        // Drops Angular's development only assertions, the way the Angular CLI does in a
        // production build. Without it the debug helpers end up in the bundle.
        viteExtras: "  define: {\n    ngDevMode: 'false'\n  },",
        webpackImports: ["const HtmlWebpackPlugin = require('html-webpack-plugin');"],
        webpackPlugins: ["new HtmlWebpackPlugin({ template: './public/index.html' })"],
        webpackRules: [String.raw`{ test: /\.ts$/, use: '@ngtools/webpack' }`, String.raw`{ test: /\.css$/, use: ['style-loader', 'css-loader'] }`],
        webpackExtensions: ["'.ts'", "'.js'"],
        shared: ["@angular/core", "@angular/common", "@angular/platform-browser", "rxjs"],
        exposedComponent: "'./App': './src/app/app.component.ts'",
        entryPoint: "src/main.ts"
    }
}

/** Packages to add to package.json for a stack, beyond what the app already has */
const REQUIRED_DEV_DEPENDENCIES: Partial<Record<MicrofrontendCompiler, string[]>> = {
    [MicrofrontendCompiler.VITE]: ["@originjs/vite-plugin-federation"]
}

export interface FederationConfigRequest {
    framework?: MicrofrontendFramework
    compiler?: MicrofrontendCompiler
    /** Federation name of the microfrontend the config belongs to */
    microfrontendSlug: string
    remotes: FederationRemote[]
    /** Hosts are consumable as remotes too, so they expose their root component */
    exposeSelf?: boolean
    /** Config file already in the repository, used to keep its extension */
    configPath?: string
}

export interface IntegrationInstructions {
    /** Where the config belongs in the repository */
    configPath?: string
    /** Full content of the bundler config */
    config?: string
    /** Snippet for the entry point of the host app */
    bootstrap?: string
    /** What the reader (or the integration) has to install */
    dependencies: string[]
    installCommand?: string
    /** Everything above, concatenated, which is what the instructions screen renders */
    code: string
    /**
     * True when the stack does not use module federation at all: there is no config to write and
     * the host resolves the url at runtime. The screen owns the wording, so it stays translated.
     */
    runtimeIntegration?: boolean
}

/**
 * Generates the module federation configuration of a microfrontend for its own stack.
 *
 * One place produces both the instructions shown on the integration screen and the file the
 * integration writes into the repository, so what a user is told to do and what the platform
 * does on their behalf can never drift apart.
 */
export class FederationConfigService {
    getInstructions(request: FederationConfigRequest): IntegrationInstructions {
        const { compiler, framework } = request

        if (compiler === MicrofrontendCompiler.WEBCOMPONENT) {
            return this.webComponentInstructions()
        }

        if (!compiler || !framework) {
            return { dependencies: [], code: "" }
        }

        const profile = FRAMEWORK_PROFILES[framework]
        const config = compiler === MicrofrontendCompiler.VITE ? this.viteConfig(request, profile) : this.webpackConfig(request, profile)
        const configPath = request.configPath || (compiler === MicrofrontendCompiler.VITE ? "vite.config.js" : "webpack.config.js")
        const bootstrap = this.bootstrapSnippet(request, profile, compiler)
        const dependencies = [...(REQUIRED_DEV_DEPENDENCIES[compiler] || [])]

        return {
            configPath,
            config,
            bootstrap,
            dependencies,
            installCommand: dependencies.length > 0 ? `npm install ${dependencies.join(" ")} --save-dev` : undefined,
            code: `${config}${bootstrap}`
        }
    }

    /** The dependency every host needs to resolve the url of its remotes at runtime */
    getRuntimeDependencies(): string[] {
        return [CLIENT_SDK_PACKAGE]
    }

    private webComponentInstructions(): IntegrationInstructions {
        return { dependencies: [], code: "", runtimeIntegration: true }
    }

    private remotesBlock(remotes: FederationRemote[], render: (remote: FederationRemote) => string, indent: string): string {
        if (remotes.length === 0) {
            return ""
        }

        return `
${indent}remotes: {
${indent}  // One entry per microfrontend this host consumes. The key is the name you import
${indent}  // from ("${remotes[0].name}/Button"), the string passed to remoteUrl() is the slug in
${indent}  // the orchestrator. Never write a url here: the backend resolves the version.
${remotes.map(render).join(",\n")}
${indent}},`
    }

    private viteConfig({ microfrontendSlug, remotes, exposeSelf }: FederationConfigRequest, profile: FrameworkProfile): string {
        // `externalType: 'promise'` tells the plugin that `external` is an expression resolving to
        // the url instead of the url itself, so it is awaited in the host bundle at import time
        const remotesBlock = this.remotesBlock(
            remotes,
            remote => `        ${remote.name}: {
          external: \`import('${CLIENT_SDK_PACKAGE}').then(m => m.remoteUrl('${remote.slug}'))\`,
          externalType: 'promise'
        }`,
            "      "
        )

        const frameworkPlugin = profile.vitePluginCall ? `${profile.vitePluginCall},\n    ` : ""

        return `// vite.config.js
import { defineConfig } from 'vite'
import federation from '@originjs/vite-plugin-federation'
${profile.vitePluginImport ? `${profile.vitePluginImport}\n` : ""}
export default defineConfig({
  plugins: [
    ${frameworkPlugin}federation({
      name: '${microfrontendSlug}',
      // A host is consumable as a remote too: the orchestrator serves this file at
      // assets/remoteEntry.js, which is what the catalogue entry declares.
      filename: 'remoteEntry.js',${
          exposeSelf
              ? `
      exposes: {
        ${profile.exposedComponent}
      },`
              : ""
}${remotesBlock}
      shared: [${profile.shared.map(dependency => `'${dependency}'`).join(", ")}]
    })
  ],
${profile.viteExtras ? `${profile.viteExtras}\n` : ""}  build: {
    modulePreload: false,
    target: 'esnext',
    minify: false,
    cssCodeSplit: false
  }
})`
    }

    private webpackConfig({ microfrontendSlug, remotes, exposeSelf }: FederationConfigRequest, profile: FrameworkProfile): string {
        // `promise <expression>` is how ModuleFederationPlugin declares a remote whose url is only
        // known at runtime: the expression is inlined in the host bundle and awaited before use
        const remotesBlock = this.remotesBlock(remotes, remote => `        ${remote.name}: \`promise import('${CLIENT_SDK_PACKAGE}').then(m => m.remoteUrl('${remote.slug}'))\``, "      ")

        const sharedBlock = profile.shared.map(dependency => `        '${dependency}': { singleton: true }`).join(",\n")
        const imports = ["const webpack = require('webpack');", ...(profile.webpackImports || []), "const { ModuleFederationPlugin } = webpack.container;"]
        const plugins = [...(profile.webpackPlugins || [])]

        return `// webpack.config.js
${imports.join("\n")}

module.exports = {
  entry: './src/index',
  mode: 'development',
  output: {
    // Chunks are resolved from document.currentScript.src, which is the url before any
    // redirect. Leave this on 'auto' so a version pinned entry keeps loading its own chunks
    // and two builds never mix on one page.
    publicPath: 'auto',
    clean: true
  },
  resolve: {
    extensions: [${(profile.webpackExtensions || []).join(", ")}]
  },
  module: {
    rules: [
${(profile.webpackRules || []).map(rule => `      ${rule}`).join(",\n")}
    ]
  },
  plugins: [
${plugins.map(plugin => `    ${plugin},`).join("\n")}
    new ModuleFederationPlugin({
      name: '${microfrontendSlug}',
      filename: 'remoteEntry.js',${
          exposeSelf
              ? `
      exposes: {
        ${profile.exposedComponent}
      },`
              : ""
}${remotesBlock}
      shared: {
${sharedBlock}
      }
    })
  ]
};`
    }

    /**
     * The generated remotes resolve themselves through the SDK, and the SDK has to be told which
     * backend, project and environment to ask: without this block the config cannot work.
     *
     * It is emitted commented out because it does not belong to the bundler config but to the
     * entry point of the host app, where it has to run before anything imports a remote.
     */
    private bootstrapSnippet({ remotes }: FederationConfigRequest, profile: FrameworkProfile, compiler: MicrofrontendCompiler): string {
        if (remotes.length === 0) {
            return ""
        }

        const isVite = compiler === MicrofrontendCompiler.VITE
        const readEnvVariable = (variable: string) => (isVite ? `import.meta.env.VITE_${variable}` : `process.env.${variable}`)
        const envNote = isVite ? "Vite only exposes to the bundle the variables prefixed with VITE_." : "Expose the three variables to the bundle with webpack.EnvironmentPlugin or DefinePlugin."

        return `

// ---------------------------------------------------------------------------
// Host bootstrap: paste this at the very top of your entry point (${profile.entryPoint}).
// The remotes above ask the SDK for their url, so configure() has to run before
// anything imports one of them.
// ${envNote}
// ---------------------------------------------------------------------------
/*
import { configure } from '${CLIENT_SDK_PACKAGE}'

configure({
  backendUrl: ${readEnvVariable("MFE_BACKEND_URL")},
  projectId: ${readEnvVariable("MFE_PROJECT_ID")},
  environment: ${readEnvVariable("MFE_ENVIRONMENT")}
})
*/`
    }
}

export default FederationConfigService
