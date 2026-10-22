import { MicrofrontendCompiler, MicrofrontendFramework } from "../types/MicrofrontendStack"

/** The package a host imports remoteUrl() and configure() from */
export const CLIENT_SDK_PACKAGE = "@mfe-orchestrator-hub/client"

/**
 * Where the SDK publishes its webpack remote loader. A webpack config reaches it through this
 * global because the `promise` expression it declares cannot import a package.
 */
export const SDK_GLOBAL = "globalThis.__MFE_ORCHESTRATOR__"

/**
 * A slug turned into an identifier module federation accepts as a remote name: slashes become
 * underscores and dashes go, because the host imports from it ("myremote/Button").
 */
export const federationName = (slug: string): string => slug.replace(/\//g, "_").replace(/-/g, "")

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
    /** Entries the framework needs in the `define` block of vite.config */
    viteDefines?: string[]
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
        webpackRules: [String.raw`{ test: /\.(ts|tsx)$/, exclude: /node_modules/, use: { loader: 'ts-loader' } }`, String.raw`{ test: /\.css$/, use: ['style-loader', 'css-loader'] }`],
        webpackExtensions: ["'.ts'", "'.tsx'", "'.js'", "'.jsx'"],
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
        viteDefines: ["ngDevMode: 'false'"],
        webpackImports: ["const HtmlWebpackPlugin = require('html-webpack-plugin');", "const { AngularWebpackPlugin } = require('@ngtools/webpack');"],
        webpackPlugins: ["new HtmlWebpackPlugin({ template: './public/index.html' })", "new AngularWebpackPlugin({ tsconfig: 'tsconfig.json', jitMode: false })"],
        // AngularWebpackPlugin above installs the AOT compiler behind this loader
        webpackRules: [String.raw`{ test: /\.[cm]?[jt]sx?$/, loader: '@ngtools/webpack' }`, String.raw`{ test: /\.css$/, use: ['style-loader', 'css-loader'] }`],
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

/**
 * The shared React contract of a single-spa root config: the applications keep React as bare
 * imports, and the browser resolves them through an import map the root config generates.
 */
const SINGLE_SPA_SHARED_REACT = `

// ---------------------------------------------------------------------------
// Shared React: the import map
// The applications keep react, react-dom, react-dom/client and react/jsx-runtime
// as bare imports. The root config answers them with an import map, injected at
// the top of <head> before any module script, pointing at ES module re-exports of
// its own React (the sharedImportMap plugin of template-single-spa-react-host's
// vite.config.ts builds them as extra entries of the same bundle):
//
// <script type="importmap">
// { "imports": {
//     "react": "/assets/shared-react-<hash>.js",
//     "react-dom": "/assets/shared-react-dom-<hash>.js",
//     "react-dom/client": "/assets/shared-react-dom-client-<hash>.js",
//     "react/jsx-runtime": "/assets/shared-react-jsx-runtime-<hash>.js"
// } }
// </script>
//
// One React for the whole page. A package shared here must be external in every
// application, and a React subpath an application imports must be in the map.
// ---------------------------------------------------------------------------`

/**
 * The shared React contract of a micro-lc shell: a sandboxed UMD parcel cannot import modules,
 * but reads that miss its sandbox fall through to the real window, where the shell publishes React.
 */
const MICRO_LC_SHARED_REACT = `

// ---------------------------------------------------------------------------
// Shared React: the window globals (src/shared-react.ts, imported before micro-lc
// mounts anything). The parcels build React as externals mapped to these names:
// renaming one breaks every parcel.
// ---------------------------------------------------------------------------
/*
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as ReactDOMClient from 'react-dom/client'
import * as ReactJSXRuntime from 'react/jsx-runtime'

window.React = React
window.ReactDOM = { ...ReactDOM, ...ReactDOMClient }
window.ReactJSXRuntime = ReactJSXRuntime
*/`

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
    /** Id of the project the microfrontend belongs to, written into the config */
    projectId?: string
    /** Base url of the console API, written into the config */
    backendUrl?: string
}

export interface IntegrationInstructions {
    /** Where the config belongs in the repository */
    configPath?: string
    /** Full content of the bundler config */
    config?: string
    /** Snippet for the entry point of the host app */
    bootstrap?: string
    /** What the reader (or the integration) has to install as build-time packages */
    dependencies: string[]
    /** Packages the app itself imports at runtime, beyond the client SDK every host needs */
    runtimeDependencies?: string[]
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

        if (compiler === MicrofrontendCompiler.SINGLE_SPA) {
            return this.singleSpaInstructions(request)
        }

        if (compiler === MicrofrontendCompiler.MICRO_LC) {
            return this.microlcInstructions(request)
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

    /**
     * single-spa: no module federation. A root config (any microfrontend consuming others, or a
     * host) gets the file registering its applications, each loaded with `import()` of the url
     * `remoteUrl()` resolves; an application gets the library build that makes it one ES module
     * exporting lifecycles, React kept external. Modelled on template-single-spa-react-host and
     * template-single-spa-react-remote.
     */
    private singleSpaInstructions(request: FederationConfigRequest): IntegrationInstructions {
        if (!this.isHost(request)) {
            const configPath = request.configPath || "vite.config.ts"
            const config = this.singleSpaApplicationConfig(configPath)
            return { configPath, config, dependencies: [], runtimeDependencies: ["single-spa-react"], installCommand: "npm install single-spa-react", code: config }
        }

        const config = this.singleSpaApplicationsFile(request.remotes)
        const bootstrap = this.integrationBootstrap(request, "src/main.tsx", [
            "import { start } from 'single-spa'",
            "import { registerApplications } from './applications'",
            "",
            "registerApplications()",
            "start()"
        ])
        const runtimeDependencies = ["single-spa"]

        return {
            configPath: "src/applications.ts",
            config,
            bootstrap,
            dependencies: [],
            runtimeDependencies,
            installCommand: `npm install ${[...runtimeDependencies, CLIENT_SDK_PACKAGE].join(" ")}`,
            code: `${config}${bootstrap}${SINGLE_SPA_SHARED_REACT}`
        }
    }

    /**
     * micro-lc: no module federation either. A shell gets the micro-lc configuration built at
     * runtime, one parcel per remote whose entry script is the url `remoteUrl()` resolves; a parcel
     * gets the UMD library build qiankun can evaluate, React read from the shell's window globals.
     * Modelled on template-microlc-react-host and template-microlc-react-remote.
     */
    private microlcInstructions(request: FederationConfigRequest): IntegrationInstructions {
        if (!this.isHost(request)) {
            const configPath = request.configPath || "vite.config.ts"
            const config = this.microlcParcelConfig(configPath, federationName(request.microfrontendSlug))
            return { configPath, config, dependencies: [], code: config }
        }

        const config = this.microlcConfigFile(request.remotes)
        const bootstrap = this.integrationBootstrap(request, "src/main.tsx", [
            "// Publishes the host's React on window for the parcels (see below).",
            "import './shared-react'",
            "import { buildMicrolcConfig } from './microlc-config'",
            "",
            "const mountPoint = document.getElementById('microlc') as HTMLElement",
            "const config = await buildMicrolcConfig()",
            "await customElements.whenDefined('micro-lc')",
            "// Markup, not document.createElement(): micro-lc's constructor appends children.",
            "// Setting config in the same task makes micro-lc render it once.",
            "mountPoint.innerHTML = '<micro-lc></micro-lc>'",
            ";(mountPoint.firstElementChild as HTMLElementTagNameMap['micro-lc']).config = config"
        ])
        const runtimeDependencies = ["@micro-lc/orchestrator"]

        return {
            configPath: "src/microlc-config.ts",
            config,
            bootstrap,
            dependencies: ["@micro-lc/interfaces"],
            runtimeDependencies,
            installCommand: `npm install ${[...runtimeDependencies, CLIENT_SDK_PACKAGE].join(" ")}`,
            code: `${config}${bootstrap}${MICRO_LC_SHARED_REACT}`
        }
    }

    /** Whoever consumes others, or is declared a host, is the one wiring the integration up */
    private isHost({ remotes, exposeSelf }: FederationConfigRequest): boolean {
        return remotes.length > 0 || Boolean(exposeSelf)
    }

    private singleSpaApplicationsFile(remotes: FederationRemote[]): string {
        const registrations =
            remotes.length > 0
                ? remotes.map(remote => this.singleSpaRegistration(remote.slug, "")).join("\n")
                : `  // No remote is linked to this root config yet. Each one becomes:\n${this.singleSpaRegistration("<slug>", "// ")}`

        return `// src/applications.ts
import { remoteUrl } from '${CLIENT_SDK_PACKAGE}'
import { registerApplication } from 'single-spa'

// One registerApplication() per microfrontend this root config mounts. The string
// passed to remoteUrl() is the slug in the orchestrator: it resolves to the url of
// the application's entry module, already pinned to the version (stable or canary)
// the backend picked for this page. Use it verbatim and never write a url here.
//
// Each application is a native ES module: its bare imports of react and react-dom
// resolve through the import map of index.html, to this root config's React.
// single-spa-react mounts it in <div id="single-spa-application:<name>">; pass
// customProps: { domElementGetter } to mount it somewhere else.
export function registerApplications() {
${registrations}
}
`
    }

    private singleSpaRegistration(slug: string, comment: string): string {
        return [
            "registerApplication({",
            `  name: '${slug}',`,
            "  app: async () => {",
            "    // Resolve the url first, then import it: Vite wraps every dynamic import in a",
            "    // non-async preload callback, so import(await remoteUrl(...)) breaks the build.",
            `    const url = await remoteUrl('${slug}')`,
            "    return import(/* @vite-ignore */ url)",
            "  },",
            `  activeWhen: '/${slug}'`,
            "})"
        ]
            .map(line => `  ${comment}${line}`)
            .join("\n")
    }

    private singleSpaApplicationConfig(configPath: string): string {
        return `// ${configPath}
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Provided by the root config's import map: they stay bare imports in the build, so
// the application renders with the root config's React instead of shipping its own.
// Keep this list in line with the root config's shared packages.
const shared = [/^react($|\\/)/, /^react-dom($|\\/)/]

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'esnext',
    // A single-spa application is an ES module exporting bootstrap, mount and unmount
    // (src/spa.tsx, with single-spa-react). The output is dist/index.js, a fixed name:
    // it is the entry point the orchestrator serves, so keep it as the microfrontend's
    // entry point. Lazy chunks are imported relatively, from the versioned url.
    lib: {
      entry: 'src/spa.tsx',
      formats: ['es'],
      fileName: () => 'index.js'
    },
    rolldownOptions: {
      external: shared
    }
  }
})
`
    }

    private microlcConfigFile(remotes: FederationRemote[]): string {
        const applications =
            remotes.length > 0
                ? remotes.map(remote => this.microlcApplication(remote.slug, "")).join(",\n")
                : `      // No remote is linked to this shell yet. Each one becomes:\n${this.microlcApplication("<slug>", "// ")}`
        const defaultUrl = remotes.length > 0 ? `\n    settings: { defaultUrl: './${remotes[0].slug}/' },` : ""

        return `// src/microlc-config.ts
import { remoteUrl } from '${CLIENT_SDK_PACKAGE}'
import type { Config } from '@micro-lc/interfaces/v2'

// The micro-lc configuration, built at runtime instead of a static config.json:
// a parcel's entry is the url the console resolves for its slug, already pinned
// to the version (stable or canary) this page must get. Never write a url here.
// remoteUrl() shares one manifest request for the whole page.
export async function buildMicrolcConfig(): Promise<Config> {
  return {
    version: 2,${defaultUrl}
    applications: {
      // One entry per microfrontend. The key is micro-lc's application id, the
      // string passed to remoteUrl() is the slug of the microfrontend in the console.
      // The entry is one self-contained UMD script: qiankun fetches it (CORS) and
      // evaluates it in a sandbox, so no ES modules and no federation.
${applications}
    }
  }
}
`
    }

    private microlcApplication(slug: string, comment: string): string {
        return [`'${slug}': {`, "  integrationMode: 'parcel',", `  route: './${slug}/',`, `  entry: { scripts: [await remoteUrl('${slug}')] }`, "}"].map(line => `      ${comment}${line}`).join("\n")
    }

    /** @param globalName The UMD global, which stays inside the parcel's sandbox */
    private microlcParcelConfig(configPath: string, globalName: string): string {
        return `// ${configPath}
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The globals the micro-lc shell publishes its React under: a contract with the
// shell, so the names must match its window.React / ReactDOM / ReactJSXRuntime.
const reactGlobals = {
  react: 'React',
  'react-dom': 'ReactDOM',
  'react-dom/client': 'ReactDOM',
  'react/jsx-runtime': 'ReactJSXRuntime'
}

export default defineConfig({
  plugins: [react()],
  build: {
    // qiankun only evaluates classic scripts exporting bootstrap, mount and unmount
    // (src/parcel.tsx), so the parcel is a UMD library build: one self-contained
    // file, dist/parcel.js. It is the entry point the orchestrator serves, so keep
    // it as the microfrontend's entry point. No chunks and no CSS files: siblings
    // would be requested from the shell's origin.
    lib: {
      entry: 'src/parcel.tsx',
      name: '${globalName}',
      formats: ['umd'],
      fileName: () => 'parcel.js'
    },
    rolldownOptions: {
      external: Object.keys(reactGlobals),
      output: { globals: reactGlobals }
    }
  }
})
`
    }

    /**
     * The entry point of a single-spa root config or a micro-lc shell: configure() first, then
     * what starts the integration. Same configure() as the module federation hosts, but these
     * stacks keep no bundler config of ours, so the two values the SDK needs are spelled out here
     * for the reader to put in the `define` block of their vite.config, or in the CI variables.
     */
    private integrationBootstrap({ projectId, backendUrl }: FederationConfigRequest, entryPoint: string, start: string[]): string {
        const define = [
            ...(backendUrl ? [`//   'import.meta.env.VITE_MFE_BACKEND_URL': JSON.stringify(${JSON.stringify(backendUrl)}),`] : []),
            ...(projectId ? [`//   'import.meta.env.VITE_MFE_PROJECT_ID': JSON.stringify(${JSON.stringify(projectId)}),`] : [])
        ]
        const defineNote =
            define.length > 0
                ? `\n// The backend url and the project id of this microfrontend, for the define block of\n// vite.config.ts (or the VITE_MFE_* variables of the CI):\n// define: {\n${define.join("\n")}\n// }`
                : ""

        return `

// ---------------------------------------------------------------------------
// Bootstrap: paste this at the very top of your entry point (${entryPoint}).
// configure() has to run first, synchronously, before anything asks for a url.${defineNote}
// ---------------------------------------------------------------------------
/*
import { configure } from '${CLIENT_SDK_PACKAGE}'

// Optional: leave it unset and the environment is resolved from the domain this
// page is served on, so the same build can run on every environment.
const environment = import.meta.env.VITE_MFE_ENVIRONMENT?.trim()

configure({
  backendUrl: import.meta.env.VITE_MFE_BACKEND_URL,
  projectId: import.meta.env.VITE_MFE_PROJECT_ID,
  // Only a canary targeted on users reads this: userId: () => auth.currentUser?.id,
  ...(environment ? { environment } : {})
})

${start.join("\n")}
*/`
    }

    /**
     * @param sdkCall The SDK function the entries hand the slug to, named in the comment
     * @param note Comment lines a bundler needs on top of the shared ones, already indented
     */
    private remotesBlock(remotes: FederationRemote[], render: (remote: FederationRemote) => string, indent: string, sdkCall = "remoteUrl()", note: string[] = []): string {
        if (remotes.length === 0) {
            return ""
        }

        return `
${indent}remotes: {
${indent}  // One entry per microfrontend this host consumes. The key is the name you import
${indent}  // from ("${remotes[0].name}/Button"), the string passed to ${sdkCall} is the slug in
${indent}  // the orchestrator. Never write a url here: the backend resolves the version.
${note.map(line => `${indent}  // ${line}\n`).join("")}${remotes.map(render).join(",\n")}
${indent}},`
    }

    /**
     * The two values the SDK cannot work without, written into the config itself rather than read
     * out of a .env: the config is what we commit into the repository, so a fresh clone builds a
     * bundle that already knows which console to ask and which project to ask about, and there is
     * no unset variable turning into a build that fails only once it runs in a browser.
     *
     * They are emitted as `define` entries, not as literals inside the app, because the bootstrap
     * snippet reads the same `import.meta.env` names a .env would have populated: moving the values
     * into the config changes where they come from, not the code that consumes them.
     */
    private viteDefineBlock({ projectId, backendUrl }: FederationConfigRequest, profile: FrameworkProfile): string {
        const entries = [
            ...(profile.viteDefines || []),
            ...(backendUrl ? [`'import.meta.env.VITE_MFE_BACKEND_URL': JSON.stringify(${JSON.stringify(backendUrl)})`] : []),
            ...(projectId ? [`'import.meta.env.VITE_MFE_PROJECT_ID': JSON.stringify(${JSON.stringify(projectId)})`] : [])
        ]

        if (entries.length === 0) {
            return ""
        }

        return `  define: {\n${entries.map(entry => `    ${entry}`).join(",\n")}\n  },\n`
    }

    /**
     * The webpack half of the same thing. It also has to spell out MFE_ENVIRONMENT: webpack leaves
     * `process.env.X` untouched when nothing defines it, and `process` does not exist in a browser,
     * so the optional variable the bootstrap snippet reads would throw instead of being undefined.
     */
    private webpackDefinePlugin({ projectId, backendUrl }: FederationConfigRequest): string | null {
        const entries = [
            ...(backendUrl ? [`'process.env.MFE_BACKEND_URL': JSON.stringify(${JSON.stringify(backendUrl)})`] : []),
            ...(projectId ? [`'process.env.MFE_PROJECT_ID': JSON.stringify(${JSON.stringify(projectId)})`] : [])
        ]

        if (entries.length === 0) {
            return null
        }

        return `new webpack.DefinePlugin({
${entries.map(entry => `      ${entry},`).join("\n")}
      // DefinePlugin pastes the text on the right into the bundle verbatim, so the bare
      // identifier \`undefined\` is what an unset environment looks like: the SDK then resolves
      // it from the domain the page is served on. Pin this build to one environment by
      // replacing it with a quoted slug, ex. JSON.stringify('DEV').
      'process.env.MFE_ENVIRONMENT': 'undefined'
    })`
    }

    private viteConfig(request: FederationConfigRequest, profile: FrameworkProfile): string {
        const { microfrontendSlug, remotes, exposeSelf } = request
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
${this.viteDefineBlock(request, profile)}  build: {
    modulePreload: false,
    target: 'esnext',
    minify: false,
    cssCodeSplit: false
  }
})`
    }

    private webpackConfig(request: FederationConfigRequest, profile: FrameworkProfile): string {
        const { microfrontendSlug, remotes, exposeSelf } = request
        // `promise <expression>` is how ModuleFederationPlugin declares a remote whose url is only
        // known at runtime. The expression is pasted into the host bundle verbatim, outside of any
        // module, so it cannot import the SDK (a bare import() reaches the browser unresolved), and it
        // must resolve to the remote's container, not to its url. The SDK publishes a loader on a
        // global for exactly this: it resolves the url, injects the remote entry and returns the
        // container the entry defines under the second argument, which is the remote's own
        // ModuleFederationPlugin name, generated below from the same federationName() as the key.
        const remotesBlock = this.remotesBlock(
            remotes,
            remote => `        ${remote.name}: "promise ${SDK_GLOBAL}.loadWebpackRemote('${remote.slug}', '${remote.name}')"`,
            "      ",
            "loadWebpackRemote()",
            ["The second one is the name the remote gives its own ModuleFederationPlugin."]
        )

        const sharedBlock = profile.shared.map(dependency => `        '${dependency}': { singleton: true }`).join(",\n")
        const imports = ["const webpack = require('webpack');", ...(profile.webpackImports || []), "const { ModuleFederationPlugin } = webpack.container;"]
        const definePlugin = this.webpackDefinePlugin(request)
        const plugins = [...(profile.webpackPlugins || []), ...(definePlugin ? [definePlugin] : [])]

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
      // The global the remote entry defines its container under, which is what a host passes
      // to loadWebpackRemote(): an identifier, so it never holds a dash or a slash.
      name: '${federationName(microfrontendSlug)}',
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
     * backend and which project to ask: without this block the config cannot work. It reads the
     * two values off `import.meta.env` / `process.env`, which the config above already filled in.
     *
     * The environment is the one thing it does not have to be told. It is emitted as a conditional
     * spread rather than as a plain field so that the key is simply not there when the variable is
     * unset: the SDK then falls back to the `auto` endpoints, which resolve the environment from the
     * domain the page is running on. Passing `environment: undefined` would not be the same thing to
     * read, and it is exactly the shape that makes people believe the value is required.
     *
     * The logged in user is emitted commented out inside the call, because it is the one field no
     * environment variable can fill in: only the host knows it, and only a user based canary reads
     * it. Left out, those microfrontends serve everyone the stable version, which is a silent
     * outcome — hence the line, so that whoever pastes the block at least knows the option exists.
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
        const injectedBy = isVite ? "the `define` block" : "DefinePlugin"
        const envNote = `The backend url and the project id are already in the config above, written into\n// the bundle by ${injectedBy}: there is no .env to fill in. Only the environment is\n// left to read, and it is optional.`

        return `

// ---------------------------------------------------------------------------
// Host bootstrap: paste this at the very top of your entry point (${profile.entryPoint}).
// The remotes above ask the SDK for their url, so configure() has to run before
// anything imports one of them.
// ${envNote}
// ---------------------------------------------------------------------------
/*
import { configure } from '${CLIENT_SDK_PACKAGE}'

// Optional: leave it unset and the environment is resolved from the domain this
// page is served on, so the same build can run on every environment.
const environment = ${readEnvVariable("MFE_ENVIRONMENT")}

configure({
  backendUrl: ${readEnvVariable("MFE_BACKEND_URL")},
  projectId: ${readEnvVariable("MFE_PROJECT_ID")},
  // Only a canary targeted on users reads this, and nothing else can supply it.
  // A getter is resolved right before the request, so an auth round trip is in
  // time; later than that, use setUserId(). Without it those microfrontends
  // serve everyone the stable version.
  // userId: () => auth.currentUser?.id,
  ...(environment ? { environment } : {})
})
*/`
    }
}

export default FederationConfigService
