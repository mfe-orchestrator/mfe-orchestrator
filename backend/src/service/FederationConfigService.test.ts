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
