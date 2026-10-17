import { Types } from "mongoose"
import { describe, expect, it } from "vitest"
import BuiltService from "./BuiltServiceModel"
import Service from "./ServiceModel"

const aService = () => new Service({ projectId: new Types.ObjectId(), slug: "  Orders-API ", name: "Orders API" })

describe("Service model", () => {
    it("given a service with only the required fields, when it is built, then port, probes and env take their defaults and it has no API docs", async () => {
        const service = aService()

        expect(service.port).toBe(8080)
        expect(service.livenessPath).toBe("/health/live")
        expect(service.readinessPath).toBe("/health/ready")
        expect(service.docsPath).toBeUndefined()
        expect(service.openApiPath).toBeUndefined()
        expect(service.env).toEqual([])
        await expect(service.validate()).resolves.toBeUndefined()
    })

    it("given every path of a Spring Boot service, when it is validated, then it is accepted", async () => {
        const service = new Service({
            projectId: new Types.ObjectId(),
            slug: "orders",
            name: "Orders",
            livenessPath: "/actuator/health/liveness",
            readinessPath: "/actuator/health/readiness",
            docsPath: "/swagger-ui.html",
            openApiPath: "/v3/api-docs"
        })

        await expect(service.validate()).resolves.toBeUndefined()
    })

    it("given blank docs and OpenAPI paths, when it is built, then the service has none", () => {
        const service = new Service({ projectId: new Types.ObjectId(), slug: "orders", name: "Orders", docsPath: "  ", openApiPath: "" })

        expect(service.docsPath).toBeNull()
        expect(service.openApiPath).toBeNull()
    })

    it.each([
        ["livenessPath", "health/live"],
        ["livenessPath", ""],
        ["readinessPath", "/health ready"],
        ["readinessPath", `/${"x".repeat(256)}`],
        ["docsPath", "docs"],
        ["docsPath", "/my\tdocs"],
        ["openApiPath", "https://example.com/openapi.json"]
    ])("given the %s %j, when it is validated, then it is refused", async (field, value) => {
        const service = new Service({ projectId: new Types.ObjectId(), slug: "orders", name: "Orders", [field]: value })

        await expect(service.validate()).rejects.toMatchObject({ errors: { [field]: expect.anything() } })
    })

    it("given a path of 256 characters, when it is validated, then it is accepted", async () => {
        const service = new Service({ projectId: new Types.ObjectId(), slug: "orders", name: "Orders", livenessPath: `/${"x".repeat(255)}` })

        await expect(service.validate()).resolves.toBeUndefined()
    })

    it("given a slug with capitals and spaces, when it is built, then it is stored trimmed and lowercase", () => {
        expect(aService().slug).toBe("orders-api")
    })

    it("given an env variable with only a name, when it is built, then it is neither required nor secret", () => {
        const service = new Service({ projectId: new Types.ObjectId(), slug: "orders", name: "Orders", env: [{ name: "DATABASE_URL" }] })

        expect(service.env[0]).toMatchObject({ name: "DATABASE_URL", required: false, secret: false })
    })

    it("given no project, when it is validated, then it is refused", async () => {
        const service = new Service({ slug: "orders", name: "Orders" })

        await expect(service.validate()).rejects.toMatchObject({ errors: { projectId: expect.anything() } })
    })

    it("declares the slug unique inside its project", () => {
        expect(Service.schema.indexes()).toContainEqual([{ slug: 1, projectId: 1 }, expect.objectContaining({ unique: true })])
    })
})

describe("BuiltService model", () => {
    it("declares one entry per version of a service", () => {
        expect(BuiltService.schema.indexes()).toContainEqual([{ serviceId: 1, version: 1 }, expect.objectContaining({ unique: true })])
    })

    it("given no image, when it is validated, then it is refused", async () => {
        const built = new BuiltService({ serviceId: new Types.ObjectId(), version: "1.0.0" })

        await expect(built.validate()).rejects.toMatchObject({ errors: { image: expect.anything() } })
    })
})
