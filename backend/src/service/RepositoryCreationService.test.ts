import { Types } from "mongoose"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("..", () => ({ fastify: { log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }, config: {} } }))

const { getSingle, getAll } = vi.hoisted(() => ({ getSingle: vi.fn(), getAll: vi.fn() }))
vi.mock("./MarketService", () => ({
    default: class {
        getSingle = getSingle
        getAll = getAll
    }
}))

// What the provider answers: the target is filled in as TemplateScaffoldService does.
const { createRepository } = vi.hoisted(() => ({
    createRepository: vi.fn(async (_connection: unknown, target: Record<string, unknown>) => {
        Object.assign(target, { repositoryId: "42", name: (target.createData as { name: string }).name, cloneUrlHttps: "https://example.com/repo.git" })
    })
}))
vi.mock("./TemplateScaffoldService", async importOriginal => ({
    ...(await importOriginal<typeof import("./TemplateScaffoldService")>()),
    default: class {
        createRepository = createRepository
    }
}))

import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import CodeRepository from "../models/CodeRepositoryModel"
import Microfrontend from "../models/MicrofrontendModel"
import Project from "../models/ProjectModel"
import Service from "../models/ServiceModel"
import { IUser } from "../models/UserModel"
import UserProject, { RoleInProject } from "../models/UserProjectModel"
import BaseAuthorizedService from "./BaseAuthorizedService"
import RepositoryCreationService from "./RepositoryCreationService"

type WithGates = { ensureAccessToProject: () => Promise<void>; isOrganizationAdmin: () => Promise<boolean> }

const user = { _id: new Types.ObjectId(), email: "ada@example.com" } as unknown as IUser
const projectId = new Types.ObjectId()
const connectionId = new Types.ObjectId()

const remote = { slug: "vite-remote-react", type: "remote", framework: "React", compiler: "vite" }
const fastifyTemplate = { slug: "service-node-fastify", type: "service", framework: "Node.js", compiler: "docker" }

describe("RepositoryCreationService", () => {
    let role: RoleInProject
    let member: Record<string, unknown>
    let saved: { filter: Record<string, unknown>; set: Record<string, unknown> } | undefined
    /** Whether another request links a repository between the checks and the save. */
    let linkedMeanwhile: boolean

    beforeEach(() => {
        role = RoleInProject.MEMBER
        member = { _id: new Types.ObjectId(), projectId, slug: "checkout" }
        saved = undefined
        linkedMeanwhile = false
        const gates = BaseAuthorizedService.prototype as unknown as WithGates
        vi.spyOn(gates, "ensureAccessToProject").mockResolvedValue(undefined)
        vi.spyOn(gates, "isOrganizationAdmin").mockResolvedValue(false)
        vi.spyOn(UserProject, "findOne").mockImplementation((() => Promise.resolve({ role })) as never)
        vi.spyOn(Project, "findById").mockResolvedValue({ _id: projectId, organizationId: new Types.ObjectId() } as never)
        vi.spyOn(CodeRepository, "findById").mockResolvedValue({ _id: connectionId, projectId } as never)
        for (const model of [Microfrontend, Service] as const) {
            vi.spyOn(model as typeof Microfrontend, "findById").mockImplementation((() => Promise.resolve(member)) as never)
            vi.spyOn(model as typeof Microfrontend, "findOneAndUpdate").mockImplementation(((filter: Record<string, unknown>, set: Record<string, unknown>) => {
                if (linkedMeanwhile) return Promise.resolve(null)
                saved = { filter, set }
                return Promise.resolve({ ...member, ...set })
            }) as never)
        }
        getSingle.mockImplementation(async (slug: string) => [remote, fastifyTemplate].find(template => template.slug === slug) ?? null)
        getAll.mockResolvedValue([fastifyTemplate, remote])
    })

    afterEach(() => {
        vi.restoreAllMocks()
        vi.clearAllMocks()
    })

    const service = () => new RepositoryCreationService(user)
    const input = (overrides: Record<string, unknown> = {}) => ({ codeRepositoryId: String(connectionId), repositoryName: "checkout-fe", ...overrides })

    it("given a microfrontend without a repository, when one is created, then it is scaffolded from the template and linked without the creation data", async () => {
        await service().createMicrofrontendRepository(String(member._id), input({ template: "vite-remote-react", private: true }))

        expect(createRepository).toHaveBeenCalledTimes(1)
        const [, target, slug, template, options] = createRepository.mock.calls[0] as unknown as [unknown, Record<string, unknown>, string, { slug: string }, unknown]
        expect(slug).toBe("checkout")
        expect(template.slug).toBe("vite-remote-react")
        expect(options).toEqual({ microfrontendSlug: "checkout" })
        expect(saved?.set.codeRepository).toEqual({
            enabled: true,
            codeRepositoryId: String(connectionId),
            repositoryId: "42",
            name: "checkout-fe",
            cloneUrlHttps: "https://example.com/repo.git",
            gitlab: undefined,
            createData: undefined
        })
        // Nothing was known of its stack: the template's is kept, as on create
        expect(saved?.set).toMatchObject({ template: "vite-remote-react", stack: { framework: "REACT", source: "TEMPLATE" } })
        expect(target.createData).toBeUndefined()
        expect(saved?.filter).toEqual({ _id: member._id, "codeRepository.enabled": { $ne: true } })
    })

    it.each([
        ["the platform default", "assets/remoteEntry.js", "parcel.js"],
        ["none", undefined, "parcel.js"],
        ["one of its own", "dist/app.js", undefined]
    ])("given a microfrontend served by %s entry point, when its repository is created from a template with one, then the template's replaces only a default", async (_case, entryPoint, expected) => {
        getSingle.mockResolvedValue({ slug: "microlc-remote-react", type: "remote", compiler: "micro-lc", framework: "React", entryPoint: "parcel.js" })
        member = { ...member, host: { type: "MFE_ORCHESTRATOR_HUB", entryPoint } }

        await service().createMicrofrontendRepository(String(member._id), input({ template: "microlc-remote-react" }))

        expect(saved?.set["host.entryPoint"]).toBe(expected)
    })

    it("given a repository linked by another request meanwhile, when the creation saves, then it is refused as already linked", async () => {
        linkedMeanwhile = true

        await expect(service().createServiceRepository(String(member._id), input({ repositoryName: "checkout-be" }))).rejects.toMatchObject({
            code: "REPOSITORY_ALREADY_LINKED",
            statusCode: 409
        })
        expect(createRepository).toHaveBeenCalledTimes(1)
    })

    it("given a microfrontend with a template and a stack, when its repository is created without one, then its own template is used and both are kept", async () => {
        member = { ...member, template: "vite-remote-react", stack: { framework: "VUE", source: "MANUAL" } }

        await service().createMicrofrontendRepository(String(member._id), input())

        expect(getSingle).toHaveBeenCalledWith("vite-remote-react")
        expect(saved?.set).not.toHaveProperty("template")
        expect(saved?.set).not.toHaveProperty("stack")
    })

    it("given a service without a template, when its repository is created, then the default service template is scaffolded with the service placeholders", async () => {
        await service().createServiceRepository(String(member._id), input({ repositoryName: "checkout-be" }))

        const [, , slug, template, options] = createRepository.mock.calls[0] as unknown as [unknown, unknown, string, { slug: string }, { placeholders: Record<string, string> }]
        expect(slug).toBe("checkout")
        expect(template.slug).toBe("service-node-fastify")
        expect(options.placeholders["%serviceSlug%"]).toBe("checkout")
        expect(saved?.set).toMatchObject({ template: "service-node-fastify", stack: { runtime: "NODE", source: "TEMPLATE" } })
    })

    it("given a member already linked to a repository, when one is created, then it is refused before anything is created", async () => {
        member = { ...member, codeRepository: { enabled: true, codeRepositoryId: connectionId, name: "checkout" } }

        await expect(service().createMicrofrontendRepository(String(member._id), input())).rejects.toMatchObject({ code: "REPOSITORY_ALREADY_LINKED", statusCode: 409 })
        expect(createRepository).not.toHaveBeenCalled()
    })

    it("given a connection of another project, when a repository is created with it, then it is not found", async () => {
        vi.spyOn(CodeRepository, "findById").mockResolvedValue({ _id: connectionId, projectId: new Types.ObjectId() } as never)

        await expect(service().createServiceRepository(String(member._id), input())).rejects.toBeInstanceOf(EntityNotFoundError)
        expect(createRepository).not.toHaveBeenCalled()
    })

    it("given a name no provider accepts, when a repository is created, then it is refused", async () => {
        await expect(service().createMicrofrontendRepository(String(member._id), input({ repositoryName: "-checkout fe" }))).rejects.toMatchObject({ code: "INVALID_REPOSITORY_NAME" })
        expect(createRepository).not.toHaveBeenCalled()
    })

    it.each([
        ["a service", "createServiceRepository", "vite-remote-react", "MICROFRONTEND_TEMPLATE_NOT_ALLOWED"],
        ["a microfrontend", "createMicrofrontendRepository", "service-node-fastify", "SERVICE_TEMPLATE_NOT_ALLOWED"]
    ] as const)("given %s, when its repository is created from a template of the other kind, then it is refused", async (_kind, method, template, code) => {
        await expect(service()[method](String(member._id), input({ template }))).rejects.toMatchObject({ code })
        expect(createRepository).not.toHaveBeenCalled()
    })

    it("given a viewer, when a repository is created, then it is refused", async () => {
        role = RoleInProject.VIEWER

        await expect(service().createMicrofrontendRepository(String(member._id), input())).rejects.toMatchObject({ code: "REPOSITORY_CREATE_FORBIDDEN", statusCode: 403 })
        expect(createRepository).not.toHaveBeenCalled()
    })
})
