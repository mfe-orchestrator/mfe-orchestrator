import { Types } from "mongoose"
import { describe, expect, it } from "vitest"
import BuiltService from "./BuiltServiceModel"
import Service from "./ServiceModel"

const aService = () => new Service({ projectId: new Types.ObjectId(), slug: "  Orders-API ", name: "Orders API" })

describe("Service model", () => {
    it("given a service with only the required fields, when it is built, then port, healthcheck and env take their defaults", async () => {
        const service = aService()

        expect(service.port).toBe(8080)
        expect(service.healthcheckPath).toBe("/health")
        expect(service.env).toEqual([])
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
