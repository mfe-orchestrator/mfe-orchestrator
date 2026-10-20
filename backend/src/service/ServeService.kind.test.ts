import { Types } from "mongoose"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("..", () => ({
    fastify: { log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }, config: {} }
}))

import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import Deployment from "../models/DeploymentModel"
import Environment from "../models/EnvironmentModel"
import { CanaryDeploymentType, CanaryType, HostedOn, IMicrofrontend, MicrofrontendKind } from "../models/MicrofrontendModel"
import { IProject } from "../models/ProjectModel"
import ServeService from "./ServeService"

afterEach(() => {
    vi.restoreAllMocks()
})

const projectId = new Types.ObjectId()
const environment = { _id: new Types.ObjectId(), projectId, slug: "dev" }

const cart = {
    _id: new Types.ObjectId(),
    projectId,
    name: "Cart",
    slug: "cart",
    version: "1.0.0",
    host: { type: HostedOn.MFE_ORCHESTRATOR_HUB, entryPoint: "remoteEntry.js" }
}
const shell = {
    _id: new Types.ObjectId(),
    projectId,
    name: "Shell",
    slug: "shell",
    version: "2.0.0",
    kind: MicrofrontendKind.FRONTEND,
    host: { type: HostedOn.MFE_ORCHESTRATOR_HUB },
    // Ignored: the orchestrator does not serve a FRONTEND, so it has no version of ours to roll out
    canary: { enabled: true, percentage: 100, type: CanaryType.RANDOM, deploymentType: CanaryDeploymentType.BASED_ON_URL, url: "https://canary.acme.com" },
    urls: [
        { environmentId: new Types.ObjectId(), url: "https://shell.prod.acme.com" },
        { environmentId: environment._id, url: "https://shell.dev.acme.com" }
    ]
}

const deployment = { _id: new Types.ObjectId(), environmentId: environment._id, microfrontends: [cart, shell], variables: [] }

describe("ServeService, FRONTEND", () => {
    it("given a deployment with a FRONTEND, when the manifest is served, then only the microfrontends are in it", async () => {
        vi.spyOn(Deployment, "findOne").mockResolvedValue(deployment as never)
        vi.spyOn(Environment, "findById").mockResolvedValue(environment as never)

        const { microfrontends } = await new ServeService().getAllByEnvironmentId(String(environment._id))

        expect(microfrontends?.map(microfrontend => microfrontend.slug)).toEqual(["cart"])
    })

    it("given a FRONTEND, when one of its files is asked for, then it is not found", async () => {
        await expect(new ServeService().getMicrofrontendByDeployment({ _id: projectId, slug: "acme" } as unknown as IProject, deployment as never, "shell", "index.js")).rejects.toBeInstanceOf(
            EntityNotFoundError
        )
    })

    it("given a FRONTEND, when its configuration is served, then its URL is the one of that environment and its canary is ignored", async () => {
        vi.spyOn(Deployment, "findOne").mockResolvedValue(deployment as never)
        vi.spyOn(Environment, "findById").mockResolvedValue(environment as never)

        const served = await new ServeService().getMicrofrontendConfigurationByEnvironmentIdAndMfeSlug(String(environment._id), "shell")

        expect(served).toMatchObject({ slug: "shell", url: "https://shell.dev.acme.com", version: "2.0.0" })
    })

    /** It is a host asking for its own configuration: no address of its own must not make that fail */
    it("given a FRONTEND with no URL in the environment, when its configuration is served, then it comes with an empty URL", async () => {
        const withoutUrl: Partial<IMicrofrontend> = { ...shell, urls: [] } as never
        vi.spyOn(Deployment, "findOne").mockResolvedValue({ ...deployment, microfrontends: [withoutUrl] } as never)
        vi.spyOn(Environment, "findById").mockResolvedValue(environment as never)

        expect(await new ServeService().getMicrofrontendConfigurationByEnvironmentIdAndMfeSlug(String(environment._id), "shell")).toMatchObject({ slug: "shell", url: "" })
    })
})
