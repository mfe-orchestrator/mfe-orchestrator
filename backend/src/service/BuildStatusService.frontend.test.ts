import { Types } from "mongoose"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("..", () => ({
    fastify: { log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }, config: {} }
}))

import BuiltFrontend from "../models/BuiltFrontendModel"
import Deployment from "../models/DeploymentModel"
import Environment from "../models/EnvironmentModel"
import Microfrontend, { MicrofrontendKind } from "../models/MicrofrontendModel"
import { ProjectBuildStatusDTO } from "../types/BuildStatusDTO"
import BuildStatusService from "./BuildStatusService"

/** A find whose query is sorted before it is awaited, as the service does */
const sortedFind = (rows: unknown[]) => ({ sort: () => Promise.resolve(rows) }) as never

afterEach(() => {
    vi.restoreAllMocks()
})

describe("BuildStatusService, FRONTEND", () => {
    it("given a FRONTEND and a MICROFRONTEND, when the build status is read, then only the MICROFRONTEND shows what the deployment froze: the orchestrator does not deploy a FRONTEND", async () => {
        const projectId = new Types.ObjectId()
        const dev = { _id: new Types.ObjectId(), name: "Development", slug: "DEV", color: "#00f", isProduction: false }
        const shell = { _id: new Types.ObjectId(), projectId, name: "Shell", slug: "shell", kind: MicrofrontendKind.FRONTEND, version: "1.4.0" }
        const cart = { _id: new Types.ObjectId(), projectId, name: "Cart", slug: "cart", version: "2.0.0" }
        vi.spyOn(Microfrontend, "find").mockReturnValue(sortedFind([shell, cart]))
        vi.spyOn(Environment, "find").mockReturnValue(sortedFind([dev]))
        // Even a FRONTEND sits in the snapshot: what it holds there is not what runs
        vi.spyOn(Deployment, "find").mockResolvedValue([{ environmentId: dev._id, microfrontends: [{ ...shell, version: "0.1.0" }, cart] }] as never)
        vi.spyOn(BuiltFrontend, "findOne").mockReturnValue({ sort: () => ({ select: () => Promise.resolve(null) }) } as never)

        const snapshot = await (new BuildStatusService() as unknown as { fetchSnapshot: (projectId: string) => Promise<ProjectBuildStatusDTO> }).fetchSnapshot(String(projectId))

        expect(snapshot.microfrontends.map(row => [row.slug, row.versionByEnvironmentId])).toEqual([
            ["shell", {}],
            ["cart", { [String(dev._id)]: "2.0.0" }]
        ])
    })
})
