import Fastify, { FastifyInstance } from "fastify"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { BuildStatus } from "../types/BuildStatusDTO"
import buildController from "./BuildController"

const snapshot = {
    projectId: "project-1",
    fetchedAt: "2026-08-16T10:00:00.000Z",
    environments: [{ _id: "env-1", name: "Production", slug: "prod", isProduction: true }],
    microfrontends: [
        {
            microfrontendId: "mfe-1",
            name: "Checkout",
            slug: "checkout",
            versionByEnvironmentId: { "env-1": "1.2.0" },
            builds: [{ id: "10", status: BuildStatus.SUCCESS, ref: "1.2.0" }]
        }
    ]
}

const getByProjectId = vi.fn()

vi.mock("../service/BuildStatusService", () => ({
    default: class {
        getByProjectId = getByProjectId
    }
}))

describe("BuildController", () => {
    let app: FastifyInstance
    let baseUrl: string

    beforeEach(async () => {
        getByProjectId.mockReset()
        getByProjectId.mockResolvedValue(snapshot)

        app = Fastify()
        await app.register(buildController)
        const address = await app.listen({ host: "127.0.0.1", port: 0 })
        baseUrl = address
    })

    afterEach(async () => {
        await app.close()
    })

    it("Given no project header, when the snapshot is requested, then the request is rejected", async () => {
        const response = await app.inject({ method: "GET", url: "/builds" })
        expect(response.statusCode).toBeGreaterThanOrEqual(400)
    })

    it("Given a project header, when the snapshot is requested, then the build status is returned", async () => {
        const response = await app.inject({ method: "GET", url: "/builds", headers: { "project-id": "project-1" } })

        expect(response.statusCode).toBe(200)
        expect(response.json()).toEqual(snapshot)
    })

    it("Given a subscriber, when the stream is opened, then it answers as an event stream and pushes the current snapshot", async () => {
        const abortController = new AbortController()

        const response = await fetch(`${baseUrl}/builds/stream`, {
            headers: { "project-id": "project-1" },
            signal: abortController.signal
        })

        expect(response.status).toBe(200)
        expect(response.headers.get("content-type")).toContain("text/event-stream")
        // Proxies must not hold the frames back until the connection ends.
        expect(response.headers.get("x-accel-buffering")).toBe("no")

        if (!response.body) throw new Error("The event stream carried no body")

        const reader = response.body.getReader()
        const { value } = await reader.read()
        const frame = new TextDecoder().decode(value)

        expect(frame).toContain("event: snapshot")
        const data = JSON.parse(frame.split("data: ")[1].split("\n\n")[0])
        expect(data.microfrontends[0].versionByEnvironmentId["env-1"]).toBe("1.2.0")

        await reader.cancel()
        abortController.abort()
    })
})
