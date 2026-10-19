import { Types } from "mongoose"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import { ApiKeyRole } from "../models/ApiKeyModel"
import Environment from "../models/EnvironmentModel"
import ServiceDeployment from "../models/ServiceDeploymentModel"
import Service from "../models/ServiceModel"
import ServiceDeploymentService from "./ServiceDeploymentService"

const projectId = new Types.ObjectId().toString()
const serviceId = new Types.ObjectId()
const devId = new Types.ObjectId()
const prodId = new Types.ObjectId()

afterEach(() => {
    vi.restoreAllMocks()
})

describe("ServiceDeploymentService.registerWithPermissionCheck", () => {
    let findService: ReturnType<typeof vi.fn>
    let findEnvironments: ReturnType<typeof vi.fn>
    let create: ReturnType<typeof vi.fn>

    beforeEach(() => {
        findService = vi.spyOn(Service, "findOne").mockResolvedValue({ _id: serviceId, slug: "orders-api" } as never) as unknown as ReturnType<typeof vi.fn>
        findEnvironments = vi.spyOn(Environment, "find").mockResolvedValue([
            { _id: devId, slug: "DEV" },
            { _id: prodId, slug: "PROD" }
        ] as never) as unknown as ReturnType<typeof vi.fn>
        create = vi.spyOn(ServiceDeployment, "create").mockImplementation((async (doc: unknown) => doc) as never) as unknown as ReturnType<typeof vi.fn>
    })

    const register = (body: unknown, environmentSlug = "PROD", serviceSlug = "orders-api") =>
        new ServiceDeploymentService().registerWithPermissionCheck(serviceSlug, environmentSlug, projectId, body, ApiKeyRole.MANAGER)

    it.each([[ApiKeyRole.VIEWER], [undefined]])("given a %s key, when a deploy is reported, then it is forbidden before anything is read or stored", async role => {
        const refusal = new ServiceDeploymentService().registerWithPermissionCheck("orders-api", "PROD", projectId, { version: "1.2.0" }, role)

        await expect(refusal).rejects.toMatchObject({ code: "SERVICE_DEPLOYMENT_FORBIDDEN", statusCode: 403 })
        expect(findService).not.toHaveBeenCalled()
        expect(create).not.toHaveBeenCalled()
    })

    it("given a manager key and a full body, when a deploy is reported, then it is stored for the service and the environment and returned", async () => {
        const stored = await register({ version: " 1.2.0 ", image: " ghcr.io/acme/orders-api:1.2.0 ", commitSha: "abc123" }, "PROD", " Orders-API ")

        expect(findService).toHaveBeenCalledWith({ slug: "orders-api", projectId })
        expect(create).toHaveBeenCalledWith({ serviceId, environmentId: prodId, version: "1.2.0", image: "ghcr.io/acme/orders-api:1.2.0", commitSha: "abc123" })
        expect(stored).toMatchObject({ serviceId, environmentId: prodId, version: "1.2.0" })
    })

    it("given the version only, when a deploy is reported, then neither image nor commit is stored", async () => {
        await register({ version: "1.2.0" })

        expect(create).toHaveBeenCalledWith({ serviceId, environmentId: prodId, version: "1.2.0" })
    })

    it.each([["prod"], ["Prod"], [" PROD "]])("given the environment slug %j, when a deploy is reported, then it matches the environment without regard to case", async slug => {
        await register({ version: "1.2.0" }, slug)

        expect(create).toHaveBeenCalledWith(expect.objectContaining({ environmentId: prodId }))
    })

    it("given two environments differing only by case, when the exact slug is reported, then that one is chosen", async () => {
        const lowerProdId = new Types.ObjectId()
        findEnvironments.mockResolvedValue([
            { _id: prodId, slug: "PROD" },
            { _id: lowerProdId, slug: "prod" }
        ])

        await register({ version: "1.2.0" }, "prod")

        expect(create).toHaveBeenCalledWith(expect.objectContaining({ environmentId: lowerProdId }))
    })

    it("given two environments differing only by case, when a third spelling is reported, then it is refused as ambiguous", async () => {
        findEnvironments.mockResolvedValue([
            { _id: prodId, slug: "PROD" },
            { _id: new Types.ObjectId(), slug: "prod" }
        ])

        await expect(register({ version: "1.2.0" }, "Prod")).rejects.toMatchObject({ code: "ENVIRONMENT_SLUG_AMBIGUOUS", statusCode: 409 })
        expect(create).not.toHaveBeenCalled()
    })

    it("given an environment the project does not have, when a deploy is reported, then it is not found and nothing is stored", async () => {
        await expect(register({ version: "1.2.0" }, "STAGING")).rejects.toBeInstanceOf(EntityNotFoundError)
        expect(create).not.toHaveBeenCalled()
    })

    it("given a service the project does not have, when a deploy is reported, then it is not found and nothing is stored", async () => {
        findService.mockResolvedValue(null)

        await expect(register({ version: "1.2.0" }, "PROD", "unknown")).rejects.toBeInstanceOf(EntityNotFoundError)
        expect(create).not.toHaveBeenCalled()
    })

    it.each([
        [{}],
        [{ version: "" }],
        [{ version: "1.2.0 beta" }],
        [{ version: 12 }],
        [{ version: "x".repeat(129) }],
        [{ version: "1.2.0", image: 42 }],
        [{ version: "1.2.0", commitSha: ["abc"] }],
        [null]
    ])("given the body %j, when a deploy is reported, then it is refused with a 400 before anything is read", async body => {
        await expect(register(body)).rejects.toMatchObject({ code: "SERVICE_VERSION_INVALID", statusCode: 400 })
        expect(findService).not.toHaveBeenCalled()
        expect(create).not.toHaveBeenCalled()
    })

    it.each([[{ version: "1.2.0", image: "x".repeat(513) }], [{ version: "1.2.0", commitSha: "a".repeat(65) }]])(
        "given the body %j, when a deploy is reported, then the field over its limit is refused with a 400 before anything is read",
        async body => {
            await expect(register(body)).rejects.toMatchObject({ code: "SERVICE_DEPLOYMENT_FIELD_TOO_LONG", statusCode: 400 })
            expect(findService).not.toHaveBeenCalled()
            expect(create).not.toHaveBeenCalled()
        }
    )

    it("given an image and a commit at their limits, when a deploy is reported, then they are stored", async () => {
        await register({ version: "1.2.0", image: "x".repeat(512), commitSha: "a".repeat(64) })

        expect(create).toHaveBeenCalledWith(expect.objectContaining({ image: "x".repeat(512), commitSha: "a".repeat(64) }))
    })

    it("given a version that was never registered as built, when its deploy is reported, then it is stored all the same", async () => {
        await register({ version: "hotfix-from-elsewhere", image: "registry.example.com/orders:hotfix-from-elsewhere" })

        expect(create).toHaveBeenCalledWith(expect.objectContaining({ version: "hotfix-from-elsewhere" }))
    })

    it("given the same service and environment reported twice, when stored, then each report is a new record so the history is kept", async () => {
        await register({ version: "1.2.0" })
        await register({ version: "1.3.0" })

        expect(create).toHaveBeenCalledTimes(2)
        expect(create.mock.calls.map(([doc]) => doc.version)).toEqual(["1.2.0", "1.3.0"])
    })
})
