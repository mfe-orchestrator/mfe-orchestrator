import Fastify, { FastifyInstance } from "fastify"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import domainController from "./DomainController"
import domainDeploymentController from "./DomainDeploymentController"

const getByProjectId = vi.fn()
const getByDomainId = vi.fn()
const getDomainById = vi.fn()

vi.mock("../service/DomainDeploymentService", () => ({
    default: class {
        getByProjectId = getByProjectId
        getByDomainId = getByDomainId
    }
}))
vi.mock("../service/DomainService", () => ({
    default: class {
        getById = getDomainById
    }
}))

const DOMAIN = "bbbbbbbbbbbbbbbbbbbbbbbb"

describe("DomainDeploymentController", () => {
    let app: FastifyInstance

    beforeEach(async () => {
        for (const mock of [getByProjectId, getByDomainId, getDomainById]) {
            mock.mockReset()
        }
        app = Fastify()
        // Both, as the application loads them: the domain routes must not capture /domains/deployments
        await app.register(domainController)
        await app.register(domainDeploymentController)
        await app.ready()
    })

    afterEach(async () => {
        await app.close()
    })

    it("Given a project header, when the matrix is requested, then it comes from the project and not from a domain called deployments", async () => {
        getByProjectId.mockResolvedValue([{ domain: null, environments: [] }])

        const response = await app.inject({ method: "GET", url: "/domains/deployments", headers: { "project-id": "project-1" } })

        expect(response.statusCode).toBe(200)
        expect(response.json()).toEqual([{ domain: null, environments: [] }])
        expect(getByProjectId).toHaveBeenCalledWith("project-1")
        expect(getDomainById).not.toHaveBeenCalled()
    })

    it("Given no project header, when the matrix is requested, then the request is rejected", async () => {
        const response = await app.inject({ method: "GET", url: "/domains/deployments" })

        expect(response.statusCode).toBeGreaterThanOrEqual(400)
        expect(getByProjectId).not.toHaveBeenCalled()
    })

    it("Given a domain id, when its deployments are requested, then they come from that domain", async () => {
        getByDomainId.mockResolvedValue({ domain: { _id: DOMAIN }, environments: [] })

        const response = await app.inject({ method: "GET", url: `/domains/${DOMAIN}/deployments` })

        expect(response.statusCode).toBe(200)
        expect(getByDomainId).toHaveBeenCalledWith(DOMAIN)
    })
})
