import { describe, expect, it } from "vitest"
import { MicrofrontendCompiler, MicrofrontendFramework } from "../types/MicrofrontendStack"
import FederationConfigService, { federationName } from "./FederationConfigService"

const remotes = [
    { name: federationName("checkout-new"), slug: "checkout-new" },
    { name: federationName("catalog"), slug: "catalog" }
]

const configFor = (compiler: MicrofrontendCompiler, microfrontendSlug = "shell") =>
    new FederationConfigService().getInstructions({
        framework: MicrofrontendFramework.REACT,
        compiler,
        microfrontendSlug,
        remotes,
        projectId: "6f1b2c3d4e5f6a7b8c9d0e1f",
        backendUrl: "https://console.test/api"
    }).config as string

describe("FederationConfigService webpack remotes", () => {
    it("Given webpack remotes, when the config is generated, then each one loads its container through the SDK global", () => {
        const config = configFor(MicrofrontendCompiler.WEBPACK)

        expect(config).toContain(`checkoutnew: "promise globalThis.__MFE_ORCHESTRATOR__.loadWebpackRemote('checkout-new', 'checkoutnew')"`)
        expect(config).toContain(`catalog: "promise globalThis.__MFE_ORCHESTRATOR__.loadWebpackRemote('catalog', 'catalog')"`)
    })

    it("Given webpack remotes, when the config is generated, then no promise expression imports the SDK by bare specifier", () => {
        const config = configFor(MicrofrontendCompiler.WEBPACK)

        expect(config).not.toMatch(/promise import\(/)
        expect(config).not.toContain(".then(m => m.remoteUrl(")
    })

    it("Given a dashed slug, when its own webpack config is generated, then its federation name is the identifier hosts pass as the scope", () => {
        const config = configFor(MicrofrontendCompiler.WEBPACK, "checkout-new")

        expect(config).toContain("name: 'checkoutnew',")
        expect(config).not.toContain("name: 'checkout-new'")
    })

    it("Given vite remotes, when the config is generated, then they keep resolving the url with remoteUrl()", () => {
        const config = configFor(MicrofrontendCompiler.VITE)

        expect(config).toContain("external: `import('@mfe-orchestrator-hub/client').then(m => m.remoteUrl('checkout-new'))`,")
        expect(config).toContain("externalType: 'promise'")
        expect(config).not.toContain("loadWebpackRemote")
        expect(config).toContain("the string passed to remoteUrl() is the slug in")
    })
})

describe("FederationConfigService single-spa", () => {
    const instructionsFor = (overrides: Partial<Parameters<FederationConfigService["getInstructions"]>[0]> = {}) =>
        new FederationConfigService().getInstructions({
            framework: MicrofrontendFramework.REACT,
            compiler: MicrofrontendCompiler.SINGLE_SPA,
            microfrontendSlug: "root-config",
            remotes,
            exposeSelf: true,
            projectId: "6f1b2c3d4e5f6a7b8c9d0e1f",
            backendUrl: "https://console.test/api",
            ...overrides
        })

    it("Given a root config with remotes, when the instructions are generated, then each remote is registered with the url remoteUrl() resolves, imported on its own line", () => {
        const instructions = instructionsFor()

        expect(instructions.configPath).toBe("src/applications.ts")
        expect(instructions.config).toContain("import { registerApplication } from 'single-spa'")
        expect(instructions.config).toContain("name: 'checkout-new',")
        expect(instructions.config).toContain("const url = await remoteUrl('checkout-new')\n      return import(/* @vite-ignore */ url)")
        expect(instructions.config).toContain("activeWhen: '/catalog'")
        expect(instructions.config).not.toMatch(/return import\(await/)
        expect(instructions.runtimeIntegration).toBeUndefined()
    })

    it("Given a root config, when the instructions are generated, then they are no module federation config", () => {
        const { code, dependencies } = instructionsFor()

        expect(code).not.toContain("federation(")
        expect(code).not.toContain("ModuleFederationPlugin")
        expect(code).not.toContain("remoteEntry.js")
        expect(dependencies).not.toContain("@originjs/vite-plugin-federation")
    })

    it("Given a root config, when the instructions are generated, then configure() runs before registerApplications() and start()", () => {
        const { bootstrap } = instructionsFor()

        expect(bootstrap).toContain("configure({")
        expect(bootstrap!.indexOf("configure({")).toBeLessThan(bootstrap!.indexOf("registerApplications()"))
        expect(bootstrap!.indexOf("registerApplications()")).toBeLessThan(bootstrap!.indexOf("start()"))
        expect(bootstrap).toContain(`'import.meta.env.VITE_MFE_PROJECT_ID': JSON.stringify("6f1b2c3d4e5f6a7b8c9d0e1f")`)
    })

    it("Given a root config, when the instructions are generated, then they document the import map React is shared through", () => {
        const { code } = instructionsFor()

        expect(code).toContain('<script type="importmap">')
        for (const specifier of ["react", "react-dom", "react-dom/client", "react/jsx-runtime"]) {
            expect(code).toContain(`"${specifier}": "/assets/`)
        }
    })

    it("Given a root config, when the instructions are generated, then single-spa and the SDK are runtime packages", () => {
        const instructions = instructionsFor()

        expect(instructions.runtimeDependencies).toEqual(["single-spa"])
        expect(instructions.dependencies).toEqual([])
        expect(instructions.installCommand).toBe("npm install single-spa @mfe-orchestrator-hub/client")
    })

    it("Given a root config without remotes, when the instructions are generated, then the registration is an example in a comment", () => {
        const { config } = instructionsFor({ remotes: [] })

        expect(config).toContain("// registerApplication({")
        expect(config).not.toMatch(/^ {2}registerApplication\(/m)
    })

    it("Given an application, when the instructions are generated, then it is an ES library build with React external and dist/index.js as entry", () => {
        const instructions = instructionsFor({ remotes: [], exposeSelf: false })

        expect(instructions.configPath).toBe("vite.config.ts")
        expect(instructions.config).toContain("formats: ['es']")
        expect(instructions.config).toContain("fileName: () => 'index.js'")
        expect(instructions.config).toContain("const shared = [/^react($|\\/)/, /^react-dom($|\\/)/]")
        expect(instructions.config).toContain("external: shared")
    })
})

describe("FederationConfigService micro-lc", () => {
    const instructionsFor = (overrides: Partial<Parameters<FederationConfigService["getInstructions"]>[0]> = {}) =>
        new FederationConfigService().getInstructions({
            framework: MicrofrontendFramework.REACT,
            compiler: MicrofrontendCompiler.MICRO_LC,
            microfrontendSlug: "shell",
            remotes,
            exposeSelf: true,
            projectId: "6f1b2c3d4e5f6a7b8c9d0e1f",
            backendUrl: "https://console.test/api",
            ...overrides
        })

    it("Given a shell with remotes, when the instructions are generated, then the config is built at runtime with one parcel per remote", () => {
        const instructions = instructionsFor()

        expect(instructions.configPath).toBe("src/microlc-config.ts")
        expect(instructions.config).toContain("export async function buildMicrolcConfig(): Promise<Config>")
        expect(instructions.config).toContain("'checkout-new': {\n        integrationMode: 'parcel',\n        route: './checkout-new/',\n        entry: { scripts: [await remoteUrl('checkout-new')] }")
        expect(instructions.config).toContain("entry: { scripts: [await remoteUrl('catalog')] }")
        expect(instructions.config).toContain("settings: { defaultUrl: './checkout-new/' }")
        expect(instructions.runtimeIntegration).toBeUndefined()
    })

    it("Given a shell, when the instructions are generated, then they are no module federation config", () => {
        const { code } = instructionsFor()

        expect(code).not.toContain("federation(")
        expect(code).not.toContain("ModuleFederationPlugin")
        expect(code).not.toContain("remoteEntry.js")
    })

    it("Given a shell, when the instructions are generated, then they document the window globals React is shared through", () => {
        const { code, bootstrap } = instructionsFor()

        expect(code).toContain("window.React = React")
        expect(code).toContain("window.ReactDOM = { ...ReactDOM, ...ReactDOMClient }")
        expect(code).toContain("window.ReactJSXRuntime = ReactJSXRuntime")
        expect(bootstrap!.indexOf("configure({")).toBeLessThan(bootstrap!.indexOf("import './shared-react'"))
        expect(bootstrap).toContain("mountPoint.innerHTML = '<micro-lc></micro-lc>'")
    })

    it("Given a shell, when the instructions are generated, then micro-lc and the SDK are runtime packages and its types a dev one", () => {
        const instructions = instructionsFor()

        expect(instructions.runtimeDependencies).toEqual(["@micro-lc/orchestrator"])
        expect(instructions.dependencies).toEqual(["@micro-lc/interfaces"])
        expect(instructions.installCommand).toBe("npm install @micro-lc/orchestrator @mfe-orchestrator-hub/client")
    })

    it("Given a parcel, when the instructions are generated, then it is one UMD file, dist/parcel.js, reading React from the shell's globals", () => {
        const instructions = instructionsFor({ microfrontendSlug: "checkout-new", remotes: [], exposeSelf: false })

        expect(instructions.configPath).toBe("vite.config.ts")
        expect(instructions.config).toContain("formats: ['umd']")
        expect(instructions.config).toContain("fileName: () => 'parcel.js'")
        expect(instructions.config).toContain("name: 'checkoutnew',")
        expect(instructions.config).toContain("'react/jsx-runtime': 'ReactJSXRuntime'")
        expect(instructions.config).toContain("output: { globals: reactGlobals }")
    })
})

describe("FederationConfigService web components", () => {
    it("Given a web component, when the instructions are generated, then it still integrates at runtime with nothing to write", () => {
        const instructions = new FederationConfigService().getInstructions({ compiler: MicrofrontendCompiler.WEBCOMPONENT, microfrontendSlug: "shell", remotes })

        expect(instructions).toEqual({ dependencies: [], code: "", runtimeIntegration: true })
    })
})
