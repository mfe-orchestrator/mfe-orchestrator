import { Types } from "mongoose"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import Deployment from "../models/DeploymentModel"
import Domain from "../models/DomainModel"
import Environment from "../models/EnvironmentModel"
import Microfrontend, { CanaryDeploymentType, CanaryType, MicrofrontendKind } from "../models/MicrofrontendModel"
import ServiceDeployment from "../models/ServiceDeploymentModel"
import Service from "../models/ServiceModel"
import DomainDeploymentService from "./DomainDeploymentService"
import DomainService from "./DomainService"

type Doc = Record<string, unknown>
type Stage = Record<string, Record<string, unknown>>

const comparable = (value: unknown) => (value instanceof Date ? value.getTime() : typeof value === "boolean" ? Number(value) : String(value))

const matches = (doc: Doc, filter: Record<string, unknown>) =>
    Object.entries(filter).every(([field, condition]) => {
        const accepted = (condition as { $in?: unknown[] }).$in
        return accepted ? accepted.some(value => String(value) === String(doc[field])) : String(condition) === String(doc[field])
    })

/** An inclusion projection, dotted paths into objects and arrays included; `_id` is kept on the top document only */
const project = (doc: Doc, fields: Record<string, unknown>, nested = false): Doc => {
    const result: Doc = nested || !("_id" in doc) ? {} : { _id: doc._id }
    for (const path of Object.keys(fields)) {
        const [head, ...rest] = path.split(".")
        if (!(head in doc)) continue
        const value = doc[head]
        if (rest.length === 0) {
            result[head] = value
        } else if (Array.isArray(value)) {
            const previous = (result[head] as Doc[] | undefined) ?? []
            result[head] = value.map((item, index) => ({ ...previous[index], ...project(item as Doc, { [rest.join(".")]: 1 }, true) }))
        } else if (value && typeof value === "object") {
            result[head] = { ...(result[head] as Doc | undefined), ...project(value as Doc, { [rest.join(".")]: 1 }, true) }
        }
    }
    return result
}

const sortBy = (docs: Doc[], sort: Record<string, unknown>) =>
    [...docs].sort((a, b) => {
        for (const [field, direction] of Object.entries(sort)) {
            const [x, y] = [comparable(a[field]), comparable(b[field])]
            if (x !== y) return (x < y ? -1 : 1) * (direction as number)
        }
        return 0
    })

const groupFirst = (docs: Doc[], group: Record<string, unknown>) => {
    const resolve = (expression: unknown, doc: Doc): unknown =>
        typeof expression === "string" ? doc[expression.slice(1)] : Object.fromEntries(Object.entries(expression as Doc).map(([key, value]) => [key, resolve(value, doc)]))
    const groups = new Map<string, Doc>()
    for (const doc of docs) {
        const _id = resolve(group._id, doc)
        const key = JSON.stringify(_id, (_key, value) => (value instanceof Types.ObjectId ? String(value) : value))
        if (groups.has(key)) continue
        const fields = Object.entries(group).filter(([name]) => name !== "_id")
        groups.set(key, { _id, ...Object.fromEntries(fields.map(([name, accumulator]) => [name, resolve((accumulator as { $first: string }).$first, doc)])) })
    }
    return [...groups.values()]
}

/**
 * Runs a pipeline of $match, $project, $sort and $group ($first only) on plain documents: the tests have
 * no MongoDB, and which document each group keeps, from the fields the pipeline kept, is what is under test.
 * A field the pipeline drops is missing here too, so the result changes with it.
 */
const runPipeline = (docs: Doc[], pipeline: Stage[]): Doc[] =>
    pipeline.reduce((current, stage) => {
        if (stage.$match) return current.filter(doc => matches(doc, stage.$match))
        if (stage.$project) return current.map(doc => project(doc, stage.$project))
        if (stage.$sort) return sortBy(current, stage.$sort)
        if (stage.$group) return groupFirst(current, stage.$group)
        throw new Error(`Stage not supported by the test: ${Object.keys(stage).join(", ")}`)
    }, docs)

/** A find whose query is sorted before it is awaited, as the service does */
const sortedFind = (rows: unknown[]) => ({ sort: () => Promise.resolve(rows) }) as never

const projectId = new Types.ObjectId()
const domainId = new Types.ObjectId()
const otherDomainId = new Types.ObjectId()
const goneDomainId = new Types.ObjectId()
const dev = { _id: new Types.ObjectId(), name: "Development", slug: "DEV", color: "#00f", isProduction: false, order: 0 }
const prod = { _id: new Types.ObjectId(), name: "Production", slug: "PROD", color: "#f00", isProduction: true, order: 1 }
const staging = { _id: new Types.ObjectId(), name: "Staging", slug: "STAGING", color: "#0f0", isProduction: false, order: 2 }
const cart = { _id: new Types.ObjectId(), slug: "cart", name: "Cart", domainId }
const checkoutUi = { _id: new Types.ObjectId(), slug: "checkout-ui", name: "Checkout UI", domainId }
const ordersApi = { _id: new Types.ObjectId(), slug: "orders-api", name: "Orders API", domainId }
const domain = { _id: domainId, projectId, name: "Checkout", slug: "checkout", description: "Buying things" }

const at = (day: number) => new Date(Date.UTC(2026, 9, day))

const secrets = { storages: [{ name: "bucket", authentication: { secretAccessKey: "enc:v1:secret" } }], variables: [{ key: "API_URL", value: "x" }] }
const percentageCanary = (percentage: number, version: string) => ({
    enabled: true,
    percentage,
    version,
    type: CanaryType.ON_SESSION,
    deploymentType: CanaryDeploymentType.BASED_ON_VERSION
})

const devFirst = new Types.ObjectId()
const devActive = new Types.ObjectId()
const devLatest = new Types.ObjectId()
const prodActive = new Types.ObjectId()

const deployments: Doc[] = [
    { _id: devFirst, environmentId: dev._id, deploymentId: "#1", deployedAt: at(1), active: false, microfrontends: [{ _id: cart._id, version: "1.0.0" }], ...secrets },
    // The active one wins over a more recent inactive one: a rollback reactivates an older deployment
    { _id: devActive, environmentId: dev._id, deploymentId: "#2", deployedAt: at(2), active: true, microfrontends: [{ _id: cart._id, version: "1.1.0", name: "Cart" }], ...secrets },
    { _id: devLatest, environmentId: dev._id, deploymentId: "#3", deployedAt: at(3), active: false, microfrontends: [{ _id: cart._id, version: "1.2.0" }], ...secrets },
    {
        _id: prodActive,
        ...secrets,
        environmentId: prod._id,
        deploymentId: "#7",
        deployedAt: at(4),
        active: true,
        microfrontends: [
            { _id: cart._id, version: "1.0.0", canary: percentageCanary(10, "2.0.0") },
            { _id: checkoutUi._id, version: "3.0.0", canary: { ...percentageCanary(50, "4.0.0"), enabled: false } }
        ]
    }
]

const serviceDeployments: Doc[] = [
    { serviceId: ordersApi._id, environmentId: dev._id, version: "1.0.0", deployedAt: at(1), _id: new Types.ObjectId() },
    { serviceId: ordersApi._id, environmentId: dev._id, version: "1.3.0", deployedAt: at(5), _id: new Types.ObjectId() },
    { serviceId: ordersApi._id, environmentId: dev._id, version: "1.1.0", deployedAt: at(3), _id: new Types.ObjectId() }
]

let deploymentAggregate: ReturnType<typeof vi.fn>
let deploymentFind: ReturnType<typeof vi.fn>
let serviceDeploymentAggregate: ReturnType<typeof vi.fn>

/** The deployments read by id, with their projection, as the service does once it picked them */
const findDeployments = (docs: Doc[]) =>
    ((filter: Record<string, unknown>, projection: Record<string, unknown>) => ({
        lean: () => Promise.resolve(runPipeline(docs, [{ $match: filter }, { $project: projection }]))
    })) as never

beforeEach(() => {
    vi.spyOn(Environment, "find").mockReturnValue(sortedFind([dev, prod, staging]))
    deploymentAggregate = vi.spyOn(Deployment, "aggregate").mockImplementation(((pipeline: Stage[]) => Promise.resolve(runPipeline(deployments, pipeline))) as never) as unknown as ReturnType<
        typeof vi.fn
    >
    deploymentFind = vi.spyOn(Deployment, "find").mockImplementation(findDeployments(deployments)) as unknown as ReturnType<typeof vi.fn>
    serviceDeploymentAggregate = vi
        .spyOn(ServiceDeployment, "aggregate")
        .mockImplementation(((pipeline: Stage[]) => Promise.resolve(runPipeline(serviceDeployments, pipeline))) as never) as unknown as ReturnType<typeof vi.fn>
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe("DomainDeploymentService.getByDomainId", () => {
    beforeEach(() => {
        vi.spyOn(DomainService.prototype, "getById").mockResolvedValue(domain as never)
        vi.spyOn(Microfrontend, "find").mockReturnValue(sortedFind([cart, checkoutUi]))
        vi.spyOn(Service, "find").mockReturnValue(sortedFind([ordersApi]))
    })

    it("given a domain, when its deployments are read, then each environment comes in order with the deployment it serves", async () => {
        const result = await new DomainDeploymentService().getByDomainId(String(domainId))

        expect(result.domain).toEqual({ _id: domainId, name: "Checkout", slug: "checkout" })
        expect(result.environments.map(entry => entry.environment)).toEqual([
            { _id: dev._id, name: "Development", slug: "DEV", color: "#00f", isProduction: false },
            { _id: prod._id, name: "Production", slug: "PROD", color: "#f00", isProduction: true },
            { _id: staging._id, name: "Staging", slug: "STAGING", color: "#0f0", isProduction: false }
        ])
        expect(result.environments.map(entry => entry.deployment)).toEqual([{ deploymentId: "#2", deployedAt: at(2) }, { deploymentId: "#7", deployedAt: at(4) }, null])
    })

    it("given a domain, when its deployments are read, then the microfrontend versions come from the snapshot, null when missing from it or never deployed", async () => {
        const result = await new DomainDeploymentService().getByDomainId(String(domainId))
        const [inDev, inProd, inStaging] = result.environments

        expect(inDev.microfrontends).toEqual([
            { _id: cart._id, slug: "cart", name: "Cart", kind: MicrofrontendKind.MICROFRONTEND, version: "1.1.0", canary: null },
            // Created after the DEV deployment: not in its snapshot
            { _id: checkoutUi._id, slug: "checkout-ui", name: "Checkout UI", kind: MicrofrontendKind.MICROFRONTEND, version: null, canary: null }
        ])
        expect(inProd.microfrontends).toEqual([
            {
                _id: cart._id,
                slug: "cart",
                name: "Cart",
                kind: MicrofrontendKind.MICROFRONTEND,
                version: "1.0.0",
                canary: { type: CanaryType.ON_SESSION, deploymentType: CanaryDeploymentType.BASED_ON_VERSION, percentage: 10, version: "2.0.0" }
            },
            // A canary that is configured but disabled is not shown
            { _id: checkoutUi._id, slug: "checkout-ui", name: "Checkout UI", kind: MicrofrontendKind.MICROFRONTEND, version: "3.0.0", canary: null }
        ])
        expect(inStaging.microfrontends.map(microfrontend => microfrontend.version)).toEqual([null, null])
    })

    it("given canaries served to enrolled users or from a URL, when the deployments are read, then their type comes along and a URL canary has no version", async () => {
        deploymentFind.mockImplementation(
            findDeployments([
                {
                    _id: prodActive,
                    environmentId: prod._id,
                    deploymentId: "#7",
                    deployedAt: at(4),
                    microfrontends: [
                        { _id: cart._id, version: "1.0.0", canary: { ...percentageCanary(0, "2.0.0"), type: CanaryType.ON_USER } },
                        {
                            _id: checkoutUi._id,
                            version: "3.0.0",
                            canary: { ...percentageCanary(20, "ignored"), type: CanaryType.RANDOM, deploymentType: CanaryDeploymentType.BASED_ON_URL, url: "https://canary.example.com" }
                        }
                    ]
                }
            ])
        )

        const result = await new DomainDeploymentService().getByDomainId(String(domainId))

        expect(result.environments[1].microfrontends.map(microfrontend => microfrontend.canary)).toEqual([
            { type: CanaryType.ON_USER, deploymentType: CanaryDeploymentType.BASED_ON_VERSION, percentage: 0, version: "2.0.0" },
            { type: CanaryType.RANDOM, deploymentType: CanaryDeploymentType.BASED_ON_URL, percentage: 20, version: null }
        ])
    })

    it("given several deploys reported for a service, when the deployments are read, then the latest by date wins and an environment without reports has none", async () => {
        const result = await new DomainDeploymentService().getByDomainId(String(domainId))

        expect(result.environments.map(entry => entry.services)).toEqual([
            [{ _id: ordersApi._id, slug: "orders-api", name: "Orders API", version: "1.3.0", deployedAt: at(5) }],
            [{ _id: ordersApi._id, slug: "orders-api", name: "Orders API", version: null, deployedAt: null }],
            [{ _id: ordersApi._id, slug: "orders-api", name: "Orders API", version: null, deployedAt: null }]
        ])
    })

    it("given a domain, when its deployments are read, then the served deployments are picked on scalars only and read alone, without their secrets", async () => {
        await new DomainDeploymentService().getByDomainId(String(domainId))

        expect(deploymentAggregate).toHaveBeenCalledTimes(1)
        expect(deploymentAggregate.mock.calls[0][0]).toEqual([
            { $match: { environmentId: { $in: [dev._id, prod._id, staging._id] } } },
            { $project: { environmentId: 1, active: 1, deployedAt: 1 } },
            { $sort: { active: -1, deployedAt: -1 } },
            { $group: { _id: "$environmentId", id: { $first: "$_id" } } }
        ])
        expect(deploymentFind).toHaveBeenCalledTimes(1)
        const [filter, projection] = deploymentFind.mock.calls[0]
        expect(filter._id.$in.map(String).sort()).toEqual([devActive, prodActive].map(String).sort())
        // The snapshot also carries the variables and the storage credentials: they never leave the database
        expect(projection).toEqual({ environmentId: 1, deploymentId: 1, deployedAt: 1, "microfrontends._id": 1, "microfrontends.version": 1, "microfrontends.canary": 1 })
    })

    it("given a domain, when its deployments are read, then one aggregation keeps the latest reported deploy of each service in each environment", async () => {
        await new DomainDeploymentService().getByDomainId(String(domainId))

        expect(serviceDeploymentAggregate).toHaveBeenCalledTimes(1)
        expect(serviceDeploymentAggregate.mock.calls[0][0]).toEqual([
            { $match: { serviceId: { $in: [ordersApi._id] }, environmentId: { $in: [dev._id, prod._id, staging._id] } } },
            { $sort: { serviceId: 1, environmentId: 1, deployedAt: -1, _id: -1 } },
            { $group: { _id: { serviceId: "$serviceId", environmentId: "$environmentId" }, version: { $first: "$version" }, deployedAt: { $first: "$deployedAt" } } }
        ])
        expect(Microfrontend.find).toHaveBeenCalledWith({ projectId, domainId }, expect.anything())
    })

    it("given two reports of a service at the same moment, when the deployments are read, then the one stored last wins", async () => {
        const earlier = new Types.ObjectId()
        const later = new Types.ObjectId()
        serviceDeploymentAggregate.mockImplementation(((pipeline: Stage[]) =>
            Promise.resolve(
                runPipeline(
                    [
                        { _id: later, serviceId: ordersApi._id, environmentId: prod._id, version: "2.0.1", deployedAt: at(6) },
                        { _id: earlier, serviceId: ordersApi._id, environmentId: prod._id, version: "2.0.0", deployedAt: at(6) }
                    ],
                    pipeline
                )
            )) as never)

        const result = await new DomainDeploymentService().getByDomainId(String(domainId))

        expect(result.environments[1].services[0].version).toBe("2.0.1")
    })

    it("given a domain without services, when its deployments are read, then the service deploys are not queried", async () => {
        vi.spyOn(Service, "find").mockReturnValue(sortedFind([]))

        const result = await new DomainDeploymentService().getByDomainId(String(domainId))

        expect(serviceDeploymentAggregate).not.toHaveBeenCalled()
        expect(result.environments.every(entry => entry.services.length === 0)).toBe(true)
    })

    it("given a domain that does not exist, when its deployments are read, then it is not found", async () => {
        vi.spyOn(DomainService.prototype, "getById").mockResolvedValue(null)

        await expect(new DomainDeploymentService().getByDomainId(String(domainId))).rejects.toBeInstanceOf(EntityNotFoundError)
        expect(deploymentAggregate).not.toHaveBeenCalled()
    })
})

describe("DomainDeploymentService.getByProjectId", () => {
    const search = { _id: new Types.ObjectId(), slug: "search", name: "Search", domainId: null }
    const legacy = { _id: new Types.ObjectId(), slug: "legacy", name: "Legacy", domainId: goneDomainId }
    const usersApi = { _id: new Types.ObjectId(), slug: "users-api", name: "Users API" }
    const otherDomain = { _id: otherDomainId, name: "Account", slug: "account" }

    let access: ReturnType<typeof vi.fn>

    beforeEach(() => {
        access = vi
            .spyOn(DomainDeploymentService.prototype as unknown as { ensureAccessToProject: () => Promise<void> }, "ensureAccessToProject")
            .mockResolvedValue(undefined) as unknown as ReturnType<typeof vi.fn>
        vi.spyOn(Domain, "find").mockReturnValue(sortedFind([otherDomain, domain]))
        vi.spyOn(Microfrontend, "find").mockReturnValue(sortedFind([cart, legacy, search]))
        vi.spyOn(Service, "find").mockReturnValue(sortedFind([ordersApi, usersApi]))
    })

    it("given domains and members in none, when the project matrix is read, then every domain comes by name, then one entry for the members in no domain", async () => {
        const result = await new DomainDeploymentService().getByProjectId(String(projectId))

        expect(access).toHaveBeenCalledWith(String(projectId))
        expect(result.map(entry => entry.domain)).toEqual([{ _id: otherDomainId, name: "Account", slug: "account" }, { _id: domainId, name: "Checkout", slug: "checkout" }, null])
        // A domain without members is listed all the same
        expect(result[0].environments.map(entry => [entry.microfrontends.length, entry.services.length])).toEqual([
            [0, 0],
            [0, 0],
            [0, 0]
        ])
        expect(result[1].environments[0].microfrontends.map(microfrontend => [microfrontend.slug, microfrontend.version])).toEqual([["cart", "1.1.0"]])
        expect(result[1].environments[0].services.map(service => [service.slug, service.version])).toEqual([["orders-api", "1.3.0"]])
        // No domain, or a domain that is gone, both count as no domain
        expect(result[2].environments[0].microfrontends.map(microfrontend => microfrontend.slug)).toEqual(["legacy", "search"])
        expect(result[2].environments[0].services.map(service => service.slug)).toEqual(["users-api"])
    })

    it("given every member in a domain, when the project matrix is read, then there is no entry for the members in no domain", async () => {
        vi.spyOn(Microfrontend, "find").mockReturnValue(sortedFind([cart]))
        vi.spyOn(Service, "find").mockReturnValue(sortedFind([ordersApi]))

        const result = await new DomainDeploymentService().getByProjectId(String(projectId))

        expect(result.map(entry => entry.domain?.slug)).toEqual(["account", "checkout"])
    })

    it("given a project without environments, when the project matrix is read, then nothing is aggregated and every entry has no environment", async () => {
        vi.spyOn(Environment, "find").mockReturnValue(sortedFind([]))

        const result = await new DomainDeploymentService().getByProjectId(String(projectId))

        expect(deploymentAggregate).not.toHaveBeenCalled()
        expect(deploymentFind).not.toHaveBeenCalled()
        expect(serviceDeploymentAggregate).not.toHaveBeenCalled()
        expect(result.every(entry => entry.environments.length === 0)).toBe(true)
    })

    it("given a project the user cannot reach, when the project matrix is read, then it is refused before anything is read", async () => {
        access.mockRejectedValue(new Error("forbidden"))

        await expect(new DomainDeploymentService().getByProjectId(String(projectId))).rejects.toThrow("forbidden")
        expect(Domain.find).not.toHaveBeenCalled()
    })
})
