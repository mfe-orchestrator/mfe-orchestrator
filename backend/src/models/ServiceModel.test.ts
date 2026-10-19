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

    it("given a service with no map attached, when it is built, then it receives no config map nor secret", () => {
        expect(aService().configMapIds).toEqual([])
        expect(aService().secretIds).toEqual([])
    })

    it("given a service still holding the inline values of before the maps, when it is serialised, then they are not sent", () => {
        const service = Service.hydrate({
            _id: new Types.ObjectId(),
            projectId: new Types.ObjectId(),
            slug: "orders",
            name: "Orders",
            secrets: [{ key: "DATABASE_PASSWORD", values: [{ value: "hunter2" }] }],
            configMap: []
        })

        expect(JSON.stringify(service)).not.toContain("hunter2")
        expect(service.toObject()).not.toHaveProperty("secrets")
        expect(service.toObject()).not.toHaveProperty("configMap")
    })

    it("given a service with no base URL, when it is built, then it is exposed nowhere; given one without environment, then it is refused", async () => {
        expect(aService().urls).toEqual([])

        const service = new Service({ projectId: new Types.ObjectId(), slug: "orders", name: "Orders", urls: [{ url: "https://orders.acme.com" }] })
        await expect(service.validate()).rejects.toMatchObject({ errors: { "urls.0.environmentId": expect.anything() } })
    })

    it("given a base URL that is not http(s), when it is validated, then it is refused even without going through ServiceService", async () => {
        const service = new Service({ projectId: new Types.ObjectId(), slug: "orders", name: "Orders", urls: [{ environmentId: new Types.ObjectId(), url: "javascript:alert(1)" }] })

        await expect(service.validate()).rejects.toMatchObject({ errors: { "urls.0.url": expect.anything() } })
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
