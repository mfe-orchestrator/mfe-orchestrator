import { Types } from "mongoose"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("..", () => ({
    fastify: { log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }, config: {} }
}))

import Deployment from "../models/DeploymentModel"
import Environment from "../models/EnvironmentModel"
import { HostedOn } from "../models/MicrofrontendModel"
import { federationName } from "./FederationConfigService"
import ServeService from "./ServeService"
import { replaceFederationName } from "./TemplateScaffoldService"

afterEach(() => {
    vi.restoreAllMocks()
})

describe("ServeService manifest, nameToIntegrate", () => {
    const serve = async (slug: string) => {
        const environmentId = new Types.ObjectId()
        const microfrontend = {
            _id: new Types.ObjectId(),
            projectId: new Types.ObjectId(),
            name: "Checkout",
            slug,
            version: "1.0.0",
            host: { type: HostedOn.MFE_ORCHESTRATOR_HUB, entryPoint: "remoteEntry.js" }
        }
        vi.spyOn(Deployment, "findOne").mockResolvedValue({ _id: new Types.ObjectId(), microfrontends: [microfrontend], variables: [] } as never)
        vi.spyOn(Environment, "findById").mockResolvedValue({ _id: environmentId, slug: "dev" } as never)

        const { microfrontends } = await new ServeService().getAllByEnvironmentId(environmentId.toString())
        return microfrontends?.[0]
    }

    /**
     * loadWebpackRemote(slug) falls back to the manifest's nameToIntegrate for the container name:
     * it has to be the name the scaffolder wrote in the remote's webpack config
     */
    it("given a microfrontend scaffolded from a webpack template, when the manifest is served, then nameToIntegrate is the container name the scaffolder wrote", async () => {
        const scaffolded = replaceFederationName("name: 'exampleremote', // mfe-orchestrator:federation-name", federationName("checkout-new"))

        const served = await serve("checkout-new")

        expect(served?.nameToIntegrate).toBe("checkoutnew")
        expect(scaffolded).toBe(`name: '${served?.nameToIntegrate}', // mfe-orchestrator:federation-name`)
    })

    it("given a slug with a slash, when the manifest is served, then nameToIntegrate is federationName(slug)", async () => {
        expect((await serve("shop/cart"))?.nameToIntegrate).toBe(federationName("shop/cart"))
    })
})
