import { Types } from "mongoose"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// The scaffold service reaches the application instance for its logger; importing the real one would
// boot Fastify.
vi.mock("..", () => ({
    fastify: { log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }, config: {} }
}))

const getSingle = vi.fn()
vi.mock("./MarketService", () => ({
    default: class {
        getSingle = getSingle
    }
}))

const createRepository = vi.fn()
const createTag = vi.fn()
vi.mock("./TemplateScaffoldService", () => ({
    placeholderDomain: () => "https://console.example.com",
    default: class {
        createRepository = createRepository
        createTag = createTag
    }
}))

const forgetServices = vi.fn()
vi.mock("./workspace/workspaceCleanup", () => ({ forgetServices: (...args: unknown[]) => forgetServices(...args) }))

import { BusinessException } from "../errors/BusinessException"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import { ApiKeyRole } from "../models/ApiKeyModel"
import BuiltService from "../models/BuiltServiceModel"
import CodeRepository from "../models/CodeRepositoryModel"
import Domain from "../models/DomainModel"
import Environment from "../models/EnvironmentModel"
import Project from "../models/ProjectModel"
import ServiceDeployment from "../models/ServiceDeploymentModel"
import Service from "../models/ServiceModel"
import { ConfigMap, Secret } from "../models/VariableMapModel"
import { MicrofrontendStackSource } from "../types/MicrofrontendStack"
import ServiceDTO from "../types/ServiceDTO"
import { ServiceRuntime } from "../types/ServiceStack"
import ServiceService, { imageRepositoryOf, isNewerVersion, normalizeUrls } from "./ServiceService"

const projectId = new Types.ObjectId().toString()
const serviceId = new Types.ObjectId()

afterEach(() => {
    vi.restoreAllMocks()
    getSingle.mockReset()
    createRepository.mockReset()
    createTag.mockReset()
})

describe("ServiceService.registerVersionWithPermissionCheck", () => {
    let findOne: ReturnType<typeof vi.fn>
    let upsert: ReturnType<typeof vi.fn>
    let updateOne: ReturnType<typeof vi.fn>

    beforeEach(() => {
        vi.spyOn(Project, "findById").mockResolvedValue({ _id: projectId } as never)
        findOne = vi.spyOn(Service, "findOne").mockResolvedValue({ _id: serviceId, slug: "orders-api" } as never) as unknown as ReturnType<typeof vi.fn>
        upsert = vi
            .spyOn(BuiltService, "findOneAndUpdate")
            .mockImplementation((async (_filter: unknown, update: { $set: Record<string, unknown> }) => ({ serviceId, ...update.$set })) as never) as unknown as ReturnType<typeof vi.fn>
        updateOne = vi.spyOn(Service, "updateOne").mockResolvedValue({ matchedCount: 1 } as never) as unknown as ReturnType<typeof vi.fn>
    })

    const register = (body: unknown, slug = "orders-api", version = "1.2.0") => new ServiceService().registerVersionWithPermissionCheck(slug, version, projectId, body, ApiKeyRole.MANAGER)

    it.each([[ApiKeyRole.VIEWER], [undefined]])("given a %s key, when a version is registered, then it is forbidden before anything is read or stored", async role => {
        const refusal = new ServiceService().registerVersionWithPermissionCheck("orders-api", "1.2.0", projectId, { image: "ghcr.io/acme/orders-api:1.2.0" }, role)

        await expect(refusal).rejects.toMatchObject({ statusCode: 403 })
        expect(findOne).not.toHaveBeenCalled()
        expect(upsert).not.toHaveBeenCalled()
        expect(updateOne).not.toHaveBeenCalled()
    })

    it("given a tag that is not semver, when it is registered on a service with a version, then it is stored but the service keeps its version", async () => {
        findOne.mockResolvedValue({ _id: serviceId, slug: "orders-api", version: "1.1.0", image: { repository: "ghcr.io/acme/orders-api" } })

        await register({ image: "ghcr.io/acme/orders-api:nightly" }, "orders-api", "nightly")

        expect(upsert).toHaveBeenCalled()
        expect(updateOne).not.toHaveBeenCalled()
    })

    it("given two runs of one tag inserting at once, when the upsert hits the unique index, then it is retried once", async () => {
        upsert.mockRejectedValueOnce(Object.assign(new Error("E11000 duplicate key error"), { code: 11000 }))

        const built = await register({ image: "ghcr.io/acme/orders-api:1.2.0" })

        expect(upsert).toHaveBeenCalledTimes(2)
        expect(built).toMatchObject({ image: "ghcr.io/acme/orders-api:1.2.0" })
    })

    it("given another failure of the upsert, when a version is registered, then it is not retried", async () => {
        upsert.mockRejectedValueOnce(new Error("connection lost"))

        await expect(register({ image: "ghcr.io/acme/orders-api:1.2.0" })).rejects.toThrow("connection lost")
        expect(upsert).toHaveBeenCalledTimes(1)
    })

    /** Two pipelines finishing together: the one that lost reads the version again and decides again */
    it("given the version moved since it was read, when a version is registered, then the update reads again and keeps the newer one", async () => {
        findOne.mockResolvedValue({ _id: serviceId, slug: "orders-api", version: "1.1.0", image: { repository: "ghcr.io/acme/orders-api" } })
        updateOne.mockResolvedValueOnce({ matchedCount: 0 })
        const reread = vi.spyOn(Service, "findById").mockResolvedValue({ _id: serviceId, version: "1.3.0", image: { repository: "ghcr.io/acme/orders-api" } } as never)

        await register({ image: "ghcr.io/acme/orders-api:1.2.0" })

        expect(updateOne).toHaveBeenCalledTimes(1)
        expect(updateOne).toHaveBeenCalledWith({ _id: serviceId, version: "1.1.0" }, { $set: { version: "1.2.0" } })
        expect(reread).toHaveBeenCalledWith(serviceId)
    })

    it("given an image, when a version is registered, then it is upserted on service and version and becomes the service version", async () => {
        const built = await register({ image: "ghcr.io/acme/orders-api:1.2.0", digest: "sha256:abc", commitSha: "deadbeef" })

        expect(upsert).toHaveBeenCalledWith(
            { serviceId, version: "1.2.0" },
            { $set: { image: "ghcr.io/acme/orders-api:1.2.0", digest: "sha256:abc", commitSha: "deadbeef" } },
            expect.objectContaining({ upsert: true })
        )
        expect(updateOne).toHaveBeenCalledWith({ _id: serviceId, version: null }, { $set: { version: "1.2.0", "image.repository": "ghcr.io/acme/orders-api" } })
        expect(built).toMatchObject({ image: "ghcr.io/acme/orders-api:1.2.0", digest: "sha256:abc" })
    })

    it("given a service with its image repository set, when a version is registered, then the repository is kept", async () => {
        findOne.mockResolvedValue({ _id: serviceId, slug: "orders-api", version: "1.1.0", image: { repository: "registry.acme.io/orders" } })

        await register({ image: "ghcr.io/acme/orders-api:1.2.0" })

        expect(updateOne).toHaveBeenCalledWith({ _id: serviceId, version: "1.1.0" }, { $set: { version: "1.2.0" } })
    })

    it("given an older version registered late, when it is registered, then the service keeps its newer version", async () => {
        findOne.mockResolvedValue({ _id: serviceId, slug: "orders-api", version: "1.3.0", image: { repository: "ghcr.io/acme/orders-api" } })

        await register({ image: "ghcr.io/acme/orders-api:1.2.0" })

        expect(upsert).toHaveBeenCalled()
        expect(updateOne).not.toHaveBeenCalled()
    })

    it("given a rerun without digest, when the version is registered again, then the stale digest is removed", async () => {
        await register({ image: "ghcr.io/acme/orders-api:1.2.0" })

        expect(upsert.mock.calls[0][1]).toEqual({ $set: { image: "ghcr.io/acme/orders-api:1.2.0" }, $unset: { digest: "", commitSha: "" } })
    })

    it.each([[undefined], [{}], [{ image: "" }], [{ image: "   " }], [{ image: 42 }]])("given the body %j, when a version is registered, then it is refused before anything is stored", async body => {
        await expect(register(body)).rejects.toBeInstanceOf(BusinessException)
        expect(upsert).not.toHaveBeenCalled()
        expect(updateOne).not.toHaveBeenCalled()
    })

    it("given a digest that is not a string, when a version is registered, then it is refused", async () => {
        await expect(register({ image: "ghcr.io/acme/orders-api:1.2.0", digest: { sha: 1 } })).rejects.toBeInstanceOf(BusinessException)
    })

    it("given a slug no service of the project has, when a version is registered, then it is not found", async () => {
        findOne.mockResolvedValue(null)

        await expect(register({ image: "ghcr.io/acme/x:1" }, "unknown")).rejects.toBeInstanceOf(EntityNotFoundError)
        expect(upsert).not.toHaveBeenCalled()
    })

    /** The project comes from the API key: a slug of another project is never reachable with it */
    it("given a key of one project, when a version is registered, then the service is looked up in that project only", async () => {
        await register({ image: "ghcr.io/acme/orders-api:1.2.0" }, "Orders-API")

        const filter = findOne.mock.calls[0][0] as { slug: string; projectId: unknown }
        expect(filter.slug).toBe("orders-api")
        expect(String(filter.projectId)).toBe(projectId)
    })
})

describe("ServiceService.create", () => {
    const codeRepositoryId = new Types.ObjectId().toString()

    let exists: ReturnType<typeof vi.fn>

    beforeEach(() => {
        exists = vi.spyOn(Service, "exists").mockResolvedValue(null) as unknown as ReturnType<typeof vi.fn>
    })

    const create = async (template: Record<string, unknown> | null, slug = " Orders-API ", overrides: Partial<ServiceDTO> = {}) => {
        const service = new ServiceService()
        vi.spyOn(service as unknown as { ensureAccessToProject: () => Promise<void> }, "ensureAccessToProject").mockResolvedValue()
        vi.spyOn(CodeRepository, "findById").mockResolvedValue({ _id: codeRepositoryId, projectId } as never)
        const write = vi.spyOn(Service, "create").mockImplementation((async (doc: unknown) => doc) as never)
        getSingle.mockResolvedValue(template)
        await service.create(
            {
                name: "Orders API",
                slug,
                codeRepository: { enabled: true, codeRepositoryId, repositoryId: "", createData: { name: "orders-api", template: "service-node-fastify" } },
                ...overrides
            } as ServiceDTO,
            projectId
        )
        return write.mock.calls[0]?.[0] as unknown as ServiceDTO
    }

    it("given a service template, when a service is created, then the repository is scaffolded with the service placeholders and the stack is kept", async () => {
        const written = await create({ slug: "service-node-fastify", type: "service", compiler: "docker", framework: "Node.js" })

        expect(createRepository).toHaveBeenCalledWith(expect.anything(), expect.anything(), "orders-api", expect.objectContaining({ slug: "service-node-fastify" }), {
            placeholders: { "%serviceSlug%": "orders-api", "%domain%": "https://console.example.com" }
        })
        expect(written.template).toBe("service-node-fastify")
        expect(written.stack).toEqual({ runtime: ServiceRuntime.NODE, framework: "Node.js", source: MicrofrontendStackSource.TEMPLATE })
        expect(written.codeRepository?.createData).toBeUndefined()
    })

    it("given a microfrontend template, when a service is created, then it is refused before any repository is created", async () => {
        await expect(create({ slug: "vite-remote-react", type: "remote", compiler: "vite", framework: "React" })).rejects.toBeInstanceOf(BusinessException)
        expect(createRepository).not.toHaveBeenCalled()
    })

    it("given an unknown template, when a service is created, then it is refused before any repository is created", async () => {
        await expect(create(null)).rejects.toBeInstanceOf(BusinessException)
        expect(createRepository).not.toHaveBeenCalled()
    })

    it("given a template typed with another case, when a service is created, then it is still a service template", async () => {
        const written = await create({ slug: "service-quarkus", type: "Service", compiler: "docker", framework: "Quarkus" })

        expect(createRepository).toHaveBeenCalledTimes(1)
        expect(written.stack?.runtime).toBe(ServiceRuntime.JAVA)
    })

    const springBoot = {
        slug: "service-spring-boot",
        type: "service",
        compiler: "docker",
        framework: "Spring Boot",
        serviceDefaults: { port: 8081, livenessPath: "/actuator/health/liveness", readinessPath: "/actuator/health/readiness", docsPath: "/swagger-ui.html", openApiPath: "/v3/api-docs" }
    }

    it("given a template with service defaults and a service that sets none, when it is created, then port, probes and API docs come from the template", async () => {
        const written = await create(springBoot)

        expect(written).toMatchObject(springBoot.serviceDefaults)
        expect(written.stack?.runtime).toBe(ServiceRuntime.JAVA)
    })

    it("given a service that sets some of the template defaults, when it is created, then its own values are kept and only the rest come from the template", async () => {
        const written = await create(springBoot, " Orders-API ", { port: 9090, readinessPath: "/ready", docsPath: "" })

        expect(written).toMatchObject({
            port: 9090,
            livenessPath: "/actuator/health/liveness",
            readinessPath: "/ready",
            docsPath: "",
            openApiPath: "/v3/api-docs"
        })
    })

    it("given a template without service defaults, when a service is created, then nothing is filled in and the model defaults apply", async () => {
        const written = await create({ slug: "service-node-fastify", type: "service", framework: "Node.js" })

        expect(written.port).toBeUndefined()
        expect(written.livenessPath).toBeUndefined()
        expect(written.docsPath).toBeUndefined()
    })

    it("given a slug another service of the project has, when a service is created, then it is refused with a 409 before any repository is created", async () => {
        exists.mockResolvedValue({ _id: serviceId })

        await expect(create({ slug: "service-node-fastify", type: "service", framework: "Node.js" })).rejects.toMatchObject({ statusCode: 409, code: "SERVICE_SLUG_TAKEN" })
        expect(exists).toHaveBeenCalledWith({ slug: "orders-api", projectId: expect.anything() })
        expect(getSingle).not.toHaveBeenCalled()
        expect(createRepository).not.toHaveBeenCalled()
    })

    it.each([["a"], ["-orders"], ["orders_api"], ["orders.api"], ["orders/api"], ["x".repeat(51)], [""]])(
        "given the slug %j, when a service is created, then it is refused with a 400 before any repository is created",
        async slug => {
            await expect(create({ slug: "service-node-fastify", type: "service", framework: "Node.js" }, slug)).rejects.toMatchObject({ statusCode: 400, code: "SERVICE_SLUG_INVALID" })
            expect(exists).not.toHaveBeenCalled()
            expect(createRepository).not.toHaveBeenCalled()
        }
    )

    it("given a document the model refuses, when a service is created, then it is refused with a 400 before any repository is created", async () => {
        const service = new ServiceService()
        vi.spyOn(service as unknown as { ensureAccessToProject: () => Promise<void> }, "ensureAccessToProject").mockResolvedValue()

        const refusal = service.create({ slug: "orders-api", codeRepository: { enabled: true, codeRepositoryId, repositoryId: "", createData: { name: "orders-api" } } } as ServiceDTO, projectId)

        await expect(refusal).rejects.toMatchObject({ statusCode: 400, code: "SERVICE_INVALID" })
        expect(createRepository).not.toHaveBeenCalled()
    })
})

describe("ServiceService.update", () => {
    const service = { _id: serviceId, projectId, slug: "orders-api", name: "Orders API" }

    beforeEach(() => {
        vi.spyOn(Service, "findById").mockResolvedValue(service as never)
        vi.spyOn(ServiceService.prototype as unknown as { ensureAccessToService: () => Promise<void> }, "ensureAccessToService").mockResolvedValue(undefined)
    })

    it("given a slug in the updates, when a service is updated, then the slug is never written", async () => {
        const write = vi.spyOn(Service, "findByIdAndUpdate").mockResolvedValue(service as never)

        await new ServiceService().update(String(serviceId), { name: "Orders", slug: "renamed" } as ServiceDTO)

        expect(write.mock.calls[0][1]).toEqual({ name: "Orders" })
    })

    it("given new probe and docs paths, when a service is updated, then they are written and validated", async () => {
        const write = vi.spyOn(Service, "findByIdAndUpdate").mockResolvedValue(service as never)
        const paths = { livenessPath: "/q/health/live", readinessPath: "/q/health/ready", docsPath: "/q/swagger-ui", openApiPath: "/q/openapi" }

        await new ServiceService().update(String(serviceId), { name: "Orders", ...paths } as ServiceDTO)

        expect(write).toHaveBeenCalledWith(serviceId, { name: "Orders", ...paths }, { new: true, runValidators: true })
    })

    it("given a connection of another project, when a service is linked to it, then it is not found and nothing is written", async () => {
        const codeRepositoryId = new Types.ObjectId().toString()
        vi.spyOn(CodeRepository, "findById").mockResolvedValue({ _id: codeRepositoryId, projectId: new Types.ObjectId() } as never)
        const write = vi.spyOn(Service, "findByIdAndUpdate").mockResolvedValue(service as never)

        const refusal = new ServiceService().update(String(serviceId), { name: "Orders", codeRepository: { enabled: true, codeRepositoryId, repositoryId: "1" } } as ServiceDTO)

        await expect(refusal).rejects.toBeInstanceOf(EntityNotFoundError)
        expect(write).not.toHaveBeenCalled()
    })

    it("given a connection of its project, when a service is linked to it, then the link is written without any creation request", async () => {
        const codeRepositoryId = new Types.ObjectId().toString()
        vi.spyOn(CodeRepository, "findById").mockResolvedValue({ _id: codeRepositoryId, projectId } as never)
        const write = vi.spyOn(Service, "findByIdAndUpdate").mockResolvedValue(service as never)

        await new ServiceService().update(String(serviceId), {
            name: "Orders",
            codeRepository: { enabled: true, codeRepositoryId, repositoryId: "1", createData: { name: "x" } }
        } as ServiceDTO)

        expect(write.mock.calls[0][1]).toMatchObject({ codeRepository: { codeRepositoryId, createData: undefined } })
    })

    it("given a domain of another project, when a service is put in it, then it is not found and nothing is written", async () => {
        const domainId = new Types.ObjectId().toString()
        const exists = vi.spyOn(Domain, "exists").mockResolvedValue(null)
        const write = vi.spyOn(Service, "findByIdAndUpdate").mockResolvedValue(service as never)

        const refusal = new ServiceService().update(String(serviceId), { name: "Orders", domainId } as ServiceDTO)

        await expect(refusal).rejects.toMatchObject({ code: "DOMAIN_NOT_FOUND", statusCode: 404 })
        expect(exists).toHaveBeenCalledWith({ _id: domainId, projectId })
        expect(write).not.toHaveBeenCalled()
    })

    it("given a blank domain, when a service is updated, then it is taken out of its domain", async () => {
        const write = vi.spyOn(Service, "findByIdAndUpdate").mockResolvedValue(service as never)

        await new ServiceService().update(String(serviceId), { name: "Orders", domainId: "" } as ServiceDTO)

        expect(write.mock.calls[0][1]).toEqual({ name: "Orders", domainId: null })
    })
})

describe("ServiceService.update of the attached maps and the base URLs", () => {
    const development = new Types.ObjectId().toString()
    const production = new Types.ObjectId().toString()
    const logging = new Types.ObjectId().toString()
    const database = new Types.ObjectId().toString()
    const service = { _id: serviceId, projectId, slug: "orders-api", name: "Orders API", configMapIds: [logging], secretIds: [] }
    let write: ReturnType<typeof vi.fn>
    let configMaps: ReturnType<typeof vi.fn>
    let secrets: ReturnType<typeof vi.fn>

    beforeEach(() => {
        vi.spyOn(Service, "findById").mockResolvedValue(service as never)
        vi.spyOn(ServiceService.prototype as unknown as { ensureAccessToService: () => Promise<void> }, "ensureAccessToService").mockResolvedValue(undefined)
        vi.spyOn(Environment, "find").mockResolvedValue([{ _id: development }, { _id: production }] as never)
        configMaps = vi.spyOn(ConfigMap, "find").mockResolvedValue([{ _id: logging, name: "logging", entries: [{ key: "LOG_LEVEL" }] }] as never) as unknown as ReturnType<typeof vi.fn>
        secrets = vi.spyOn(Secret, "find").mockResolvedValue([{ _id: database, name: "database", entries: [{ key: "DATABASE_PASSWORD" }] }] as never) as unknown as ReturnType<typeof vi.fn>
        write = vi.spyOn(Service, "findByIdAndUpdate").mockResolvedValue(service as never) as unknown as ReturnType<typeof vi.fn>
    })

    const update = (changes: Partial<ServiceDTO>) => new ServiceService().update(String(serviceId), { name: "Orders API", ...changes } as ServiceDTO)

    it("given an update with neither list of maps, when the service is updated, then no map is read and neither list is written", async () => {
        await update({})

        expect(configMaps).not.toHaveBeenCalled()
        expect(secrets).not.toHaveBeenCalled()
        expect(write.mock.calls[0][1]).toEqual({ name: "Orders API" })
    })

    it("given only the secrets, when the service is updated, then they are written once each and checked against the config maps it already has", async () => {
        await update({ secretIds: [database, database] })

        expect(configMaps.mock.calls[0][0]).toMatchObject({ projectId })
        expect(write.mock.calls[0][1]).toEqual({ name: "Orders API", secretIds: [database] })
    })

    it.each([[{ $set: { secretIds: [database] } }], [{ "secretIds.0": database }]])("given %j, when the service is updated, then it is refused before any map is read", async changes => {
        const refusal = update(changes as Partial<ServiceDTO>)

        await expect(refusal).rejects.toMatchObject({ code: "SERVICE_INVALID" })
        expect(secrets).not.toHaveBeenCalled()
        expect(write).not.toHaveBeenCalled()
    })

    it("given a map that is not one of the project, when the service is updated, then it is refused and nothing is written", async () => {
        secrets.mockResolvedValue([])

        const refusal = update({ secretIds: [new Types.ObjectId().toString()] })

        await expect(refusal).rejects.toMatchObject({ code: "SERVICE_VARIABLE_MAP_UNKNOWN" })
        expect(write).not.toHaveBeenCalled()
    })

    it("given an id that is not one, when the service is updated, then it is refused", async () => {
        await expect(update({ configMapIds: ["not-an-id"] })).rejects.toMatchObject({ code: "SERVICE_VARIABLE_MAPS_INVALID" })
    })

    it("given a secret setting a key a config map of the service sets, when the service is updated, then it is refused and nothing is written", async () => {
        secrets.mockResolvedValue([{ _id: database, name: "database", entries: [{ key: "LOG_LEVEL" }] }])

        const refusal = update({ secretIds: [database] })

        await expect(refusal).rejects.toMatchObject({ code: "SERVICE_VARIABLE_KEY_DUPLICATED" })
        expect(write).not.toHaveBeenCalled()
    })

    it("given base URLs only, when the service is updated, then they are written normalised and the variables are left alone", async () => {
        await update({
            urls: [
                { environmentId: development, url: " https://orders.dev.acme.com/ " },
                { environmentId: production, url: "" }
            ]
        })

        expect(write.mock.calls[0][1]).toEqual({ name: "Orders API", urls: [{ environmentId: development, url: "https://orders.dev.acme.com" }] })
    })
})

describe("normalizeUrls", () => {
    const development = new Types.ObjectId().toString()
    const production = new Types.ObjectId().toString()
    const environments = new Set([development, production])

    it("given padded URLs with trailing slashes and a blank one, when normalised, then they are trimmed and the blank environment is left out", () => {
        expect(
            normalizeUrls(
                [
                    { environmentId: development, url: "  https://orders.dev.acme.com/api//  " },
                    { environmentId: production, url: "   " }
                ],
                environments
            )
        ).toEqual([{ environmentId: development, url: "https://orders.dev.acme.com/api" }])
    })

    it("given a URL with a port, when normalised, then it is kept", () => {
        expect(normalizeUrls([{ environmentId: development, url: "http://localhost:8080" }], environments)).toEqual([{ environmentId: development, url: "http://localhost:8080" }])
    })

    it.each([
        ["a relative URL", [{ environmentId: development, url: "orders.acme.com" }], "SERVICE_URL_INVALID"],
        ["another scheme", [{ environmentId: development, url: "ftp://orders.acme.com" }], "SERVICE_URL_INVALID"],
        ["a URL with whitespace", [{ environmentId: development, url: "https://orders acme.com" }], "SERVICE_URL_INVALID"],
        ["a URL too long", [{ environmentId: development, url: `https://acme.com/${"x".repeat(2048)}` }], "SERVICE_URL_INVALID"],
        ["a URL with a query", [{ environmentId: development, url: "https://orders.acme.com?tenant=a" }], "SERVICE_URL_INVALID"],
        ["a URL with a fragment", [{ environmentId: development, url: "https://orders.acme.com#top" }], "SERVICE_URL_INVALID"],
        ["a URL with credentials", [{ environmentId: development, url: "https://user:pass@orders.acme.com" }], "SERVICE_URL_INVALID"],
        ["a URL made of slashes only", [{ environmentId: development, url: "///" }], "SERVICE_URL_INVALID"],
        ["an environment of another project", [{ environmentId: new Types.ObjectId().toString(), url: "https://acme.com" }], "SERVICE_URL_ENVIRONMENT_UNKNOWN"],
        [
            "two URLs for one environment",
            [
                { environmentId: development, url: "https://a.acme.com" },
                { environmentId: development, url: "https://b.acme.com" }
            ],
            "SERVICE_URL_ENVIRONMENT_DUPLICATED"
        ],
        ["something that is not a list", { environmentId: development, url: "https://acme.com" }, "SERVICE_URLS_INVALID"]
    ])("given %s, when normalised, then it is refused", (_case, urls, code) => {
        expect(() => normalizeUrls(urls, environments)).toThrow(expect.objectContaining({ code }))
    })

    it("given a null entry, when normalised, then it is skipped rather than crashing", () => {
        expect(normalizeUrls([null], environments)).toEqual([])
    })
})

describe("ServiceService.build", () => {
    beforeEach(() => {
        vi.spyOn(Service, "findById").mockResolvedValue({ _id: serviceId, projectId, slug: "orders-api", codeRepository: { enabled: true } } as never)
        vi.spyOn(ServiceService.prototype as unknown as { ensureAccessToService: () => Promise<void> }, "ensureAccessToService").mockResolvedValue(undefined)
    })

    it.each([["1.2.0"], ["v1.2.0-rc.1"], ["2026.10.17_1"]])("given the version %s, when a service is built, then its repository is tagged in its project", async version => {
        await new ServiceService().build(String(serviceId), version, "main")

        expect(createTag).toHaveBeenCalledWith({ enabled: true }, projectId, version, "main")
    })

    it.each([["1.2.0+build.5"], [""], ["1.2.0 beta"], ["release/1.2.0"], ["$(rm -rf /)"], ["x".repeat(129)]])(
        "given the version %j, when a service is built, then it is refused with a 400 before anything is tagged",
        async version => {
            await expect(new ServiceService().build(String(serviceId), version)).rejects.toMatchObject({ statusCode: 400, code: "SERVICE_VERSION_INVALID" })
            expect(createTag).not.toHaveBeenCalled()
        }
    )
})

describe("imageRepositoryOf", () => {
    it.each([
        ["ghcr.io/acme/orders-api:1.2.0", "ghcr.io/acme/orders-api"],
        ["host:5000/acme/orders:1.2.0", "host:5000/acme/orders"],
        ["host:5000/acme/orders", "host:5000/acme/orders"],
        ["ghcr.io/acme/orders@sha256:abc", "ghcr.io/acme/orders"],
        ["host:5000/orders:1.2.0@sha256:abc", "host:5000/orders"],
        ["orders", "orders"]
    ])("given %s, then the repository is %s", (image, repository) => {
        expect(imageRepositoryOf(image)).toBe(repository)
    })
})

describe("isNewerVersion", () => {
    it.each([
        ["1.2.0", undefined, true],
        ["1.2.0", "1.1.9", true],
        ["1.10.0", "1.9.0", true],
        ["v2.0.0", "1.9.9", true],
        ["1.2.0", "1.2.0", false],
        ["1.1.0", "1.2.0", false],
        ["1.2.0", "1.2.0-beta.1", true],
        ["1.2.0-beta.1", "1.2.0", false],
        ["1.2.0-beta.2", "1.2.0-beta.1", true],
        ["1.2.0-alpha.10", "1.2.0-alpha.9", true],
        ["latest", undefined, true],
        ["1.2.0", "", true],
        ["latest", "1.2.0", false],
        ["1.2.0", "nightly", false]
    ])("given %s over %s, then it is newer: %s", (candidate, current, newer) => {
        expect(isNewerVersion(candidate, current)).toBe(newer)
    })
})

describe("ServiceService.delete", () => {
    it("given a service, when it is deleted, then its versions and reported deploys go and its workspace and AI changes are forgotten", async () => {
        const service = { _id: serviceId, projectId, slug: "orders-api" }
        vi.spyOn(Service, "findById").mockResolvedValue(service as never)
        vi.spyOn(ServiceService.prototype as unknown as { ensureAccessToService: () => Promise<void> }, "ensureAccessToService").mockResolvedValue(undefined)
        const deleteVersions = vi.spyOn(BuiltService, "deleteMany").mockResolvedValue({} as never)
        const deleteDeploys = vi.spyOn(ServiceDeployment, "deleteMany").mockResolvedValue({} as never)
        vi.spyOn(Service, "findByIdAndDelete").mockResolvedValue(service as never)

        await new ServiceService().delete(String(serviceId))

        expect(deleteVersions).toHaveBeenCalledWith({ serviceId })
        expect(deleteDeploys).toHaveBeenCalledWith({ serviceId })
        expect(forgetServices).toHaveBeenCalledWith([service])
    })
})
