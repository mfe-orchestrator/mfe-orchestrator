import { Types } from "mongoose"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../..", () => ({ fastify: { log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }, config: {} } }))

const { json } = vi.hoisted(() => ({ json: vi.fn() }))
vi.mock("../llm", async importOriginal => ({ ...(await importOriginal<typeof import("../llm")>()), getLlmClient: () => ({ json }) }))

const { getAll } = vi.hoisted(() => ({ getAll: vi.fn() }))
vi.mock("../MarketService", () => ({
    default: class {
        getAll = getAll
    }
}))

import { BusinessException } from "../../errors/BusinessException"
import AiModel from "../../models/AiModelModel"
import Domain from "../../models/DomainModel"
import Microfrontend from "../../models/MicrofrontendModel"
import Project from "../../models/ProjectModel"
import Service from "../../models/ServiceModel"
import { IUser } from "../../models/UserModel"
import UserProject, { RoleInProject } from "../../models/UserProjectModel"
import BaseAuthorizedService from "../BaseAuthorizedService"
import DomainPlanService, { sanitizePlan } from "./DomainPlanService"

type WithGates = { ensureAccessToProject: () => Promise<void>; isOrganizationAdmin: () => Promise<boolean> }

const user = { _id: new Types.ObjectId(), email: "ada@example.com" } as unknown as IUser
const projectId = new Types.ObjectId().toString()
const domain = { _id: new Types.ObjectId(), projectId, name: "Orders", description: "Ordering and checkout", context: "Prices are in cents" }

const templates = [
    { slug: "vite-host-react", type: "host", framework: "React", compiler: "vite", description: "React host on Vite" },
    { slug: "vite-remote-react", type: "remote", framework: "React", compiler: "vite", description: "React remote on Vite" },
    { slug: "vite-remote-vue", type: "remote", framework: "Vue", compiler: "vite", description: "Vue remote on Vite" },
    { slug: "soon-remote", type: "remote", framework: "Svelte", compiler: "vite", description: "Svelte remote on Vite", comingSoon: true },
    { slug: "service-node-fastify", type: "service", framework: "Node.js", compiler: "docker", description: "Fastify service" },
    { slug: "service-python-fastapi", type: "service", framework: "Python", compiler: "docker", description: "FastAPI service" }
]

const planned = (slug: string, template: string, repositoryName: string) => ({ name: slug, slug, template, repositoryName, reason: `${slug} reason` })

describe("sanitizePlan", () => {
    const none = () => ({ microfrontend: new Set<string>(), service: new Set<string>() })

    it("given templates of the wrong kind or unknown, when the plan is sanitized, then each becomes the default of its kind", () => {
        const plan = sanitizePlan(
            { microfrontends: [planned("orders", "service-node-fastify", "orders-fe"), planned("cart", "soon-remote", "cart-fe")], services: [planned("orders", "nope", "orders-be")] },
            templates,
            none()
        )

        expect(plan.microfrontends.map(item => item.template)).toEqual(["vite-remote-react", "vite-remote-react"])
        expect(plan.services[0].template).toBe("service-node-fastify")
    })

    it("given a slug taken in the project, when the plan is sanitized, then it gets a number and the repository is named after the new slug", () => {
        const plan = sanitizePlan({ microfrontends: [planned("orders", "vite-remote-vue", "orders-fe")], services: [] }, templates, {
            microfrontend: new Set(["orders"]),
            service: new Set()
        })

        expect(plan.microfrontends[0]).toMatchObject({ slug: "orders-2", repositoryName: "orders-2-fe", template: "vite-remote-vue" })
    })

    it("given names the platform refuses, when the plan is sanitized, then the slug is made kebab case and the repository ends with the suffix of its kind", () => {
        const plan = sanitizePlan(
            { microfrontends: [], services: [{ name: "Order API", slug: "Order API!", template: "service-python-fastapi", repositoryName: "order api", reason: "" }] },
            templates,
            none()
        )

        expect(plan.services[0]).toMatchObject({ name: "Order API", slug: "order-api", repositoryName: "order-api-be", template: "service-python-fastapi" })
    })

    it("given more components than allowed, when the plan is sanitized, then only the first three of each kind are kept", () => {
        const plan = sanitizePlan({ microfrontends: ["a1", "b2", "c3", "d4"].map(slug => planned(slug, "vite-remote-react", `${slug}-fe`)), services: [] }, templates, none())

        expect(plan.microfrontends.map(item => item.slug)).toEqual(["a1", "b2", "c3"])
    })

    it("given two components of a kind with the same slug, when the plan is sanitized, then neither their slugs nor their repositories clash", () => {
        const plan = sanitizePlan({ microfrontends: [], services: [planned("orders", "service-node-fastify", "orders-be"), planned("orders", "service-node-fastify", "orders-be")] }, templates, none())

        expect(plan.services.map(item => [item.slug, item.repositoryName])).toEqual([
            ["orders", "orders-be"],
            ["orders-2", "orders-2-be"]
        ])
    })
})

describe("sanitizePlan with long repository names", () => {
    it("given two components asking for the same 100 character repository name, when the plan is sanitized, then the numbered one still fits 100 characters", () => {
        const long = `${"a".repeat(97)}-fe`
        const plan = sanitizePlan({ microfrontends: [planned("one", "vite-remote-react", long), planned("two", "vite-remote-react", long)], services: [] }, templates, {
            microfrontend: new Set(),
            service: new Set()
        })

        expect(plan.microfrontends[0].repositoryName).toBe(long)
        expect(plan.microfrontends[1].repositoryName).toHaveLength(100)
        expect(plan.microfrontends[1].repositoryName).toMatch(/^a+-2-fe$/)
    })
})

describe("DomainPlanService.plan", () => {
    let role: RoleInProject
    let members: { microfrontend: boolean; service: boolean }

    beforeEach(() => {
        role = RoleInProject.MEMBER
        members = { microfrontend: false, service: false }
        const gates = BaseAuthorizedService.prototype as unknown as WithGates
        vi.spyOn(gates, "ensureAccessToProject").mockResolvedValue(undefined)
        vi.spyOn(gates, "isOrganizationAdmin").mockResolvedValue(false)
        vi.spyOn(UserProject, "findOne").mockImplementation((() => Promise.resolve({ role })) as never)
        vi.spyOn(Project, "findById").mockResolvedValue({ _id: projectId, organizationId: new Types.ObjectId(), name: "Shop", context: "Shop context" } as never)
        // The organization defines no AI: the system one, from the configuration the service is given, answers
        vi.spyOn(AiModel, "find").mockResolvedValue([] as never)
        vi.spyOn(Domain, "findOne").mockResolvedValue(domain as never)
        vi.spyOn(Microfrontend, "exists").mockImplementation((() => Promise.resolve(members.microfrontend ? { _id: new Types.ObjectId() } : null)) as never)
        vi.spyOn(Service, "exists").mockImplementation((() => Promise.resolve(members.service ? { _id: new Types.ObjectId() } : null)) as never)
        vi.spyOn(Microfrontend, "find").mockResolvedValue([{ slug: "catalog" }] as never)
        vi.spyOn(Service, "find").mockResolvedValue([] as never)
        getAll.mockResolvedValue(templates)
        json.mockResolvedValue({ microfrontends: [planned("checkout", "vite-remote-react", "checkout-fe")], services: [planned("orders", "service-node-fastify", "orders-be")] })
    })

    afterEach(() => {
        vi.restoreAllMocks()
        vi.clearAllMocks()
    })

    const plan = () => new DomainPlanService(user, { ANTHROPIC_API_KEY: "sk-test" }).plan(projectId, { domainId: String(domain._id), prompt: "Let customers place an order" })

    it("given a domain without members, when a plan is asked, then the model reads the request, the contexts and the templates and its plan comes back", async () => {
        const result = await plan()

        expect(result.microfrontends).toEqual([planned("checkout", "vite-remote-react", "checkout-fe")])
        expect(result.services).toEqual([planned("orders", "service-node-fastify", "orders-be")])
        const request = json.mock.calls[0][0] as { user: string }
        for (const expected of [
            "Let customers place an order",
            "Shop context",
            "Ordering and checkout",
            "Prices are in cents",
            "vite-remote-react (default)",
            "service-node-fastify (default)",
            "microfrontends: catalog"
        ]) {
            expect(request.user).toContain(expected)
        }
        // A service template is never offered as a frontend, nor one coming soon
        expect(request.user.split("<service_templates>")[0]).not.toContain("service-python-fastapi")
        expect(request.user).not.toContain("soon-remote")
    })

    it.each(["microfrontend", "service"] as const)("given a domain with a %s, when a plan is asked, then it is refused without calling the model", async kind => {
        members[kind] = true

        await expect(plan()).rejects.toMatchObject({ code: "AI_DOMAIN_PLAN_HAS_MEMBERS", statusCode: 422 })
        expect(json).not.toHaveBeenCalled()
    })

    it("given a viewer, when a plan is asked, then it is refused", async () => {
        role = RoleInProject.VIEWER

        await expect(plan()).rejects.toMatchObject({ code: "AI_CHANGE_FORBIDDEN", statusCode: 403 })
        expect(json).not.toHaveBeenCalled()
    })

    it("given a model that refuses or is cut off, when a plan is asked, then it fails with a code of its own", async () => {
        json.mockResolvedValue(null)

        const error = await plan().catch(caught => caught)
        expect(error).toBeInstanceOf(BusinessException)
        expect(error).toMatchObject({ code: "AI_DOMAIN_PLAN_FAILED" })
    })

    it("given a provider that fails, when a plan is asked, then the user gets a generic error, a rate limit its own code, never the provider's message", async () => {
        json.mockRejectedValueOnce(Object.assign(new Error("404 <html>internal admin console</html>"), { status: 404 }))
        const failed = await plan().catch(caught => caught)
        json.mockRejectedValueOnce(Object.assign(new Error("Too many requests"), { status: 429 }))
        const limited = await plan().catch(caught => caught)

        expect(failed).toMatchObject({ code: "AI_PROVIDER_ERROR", statusCode: 502 })
        expect(failed.message).not.toContain("internal")
        expect(limited).toMatchObject({ code: "RATE_LIMITED", statusCode: 429 })
    })
})
