import { Types } from "mongoose"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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
vi.mock("./TemplateScaffoldService", () => ({
    default: class {
        createRepository = createRepository
    }
}))

import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import CodeRepository from "../models/CodeRepositoryModel"
import Microfrontend from "../models/MicrofrontendModel"
import Project from "../models/ProjectModel"
import { IUser } from "../models/UserModel"
import UserProject, { RoleInProject } from "../models/UserProjectModel"
import MicrofrontendDTO from "../types/MicrofrontendDTO"
import MicrofrontendService from "./MicrofrontendService"

type WithGates = { ensureAccessToProject: () => Promise<void>; isOrganizationAdmin: () => Promise<boolean>; getDomainScope: () => Promise<string[] | undefined> }

const projectId = new Types.ObjectId()
const connectionId = new Types.ObjectId()
const user = { _id: new Types.ObjectId(), email: "ada@example.com" } as unknown as IUser

describe("MicrofrontendService.create with a new repository", () => {
    let role: RoleInProject

    beforeEach(() => {
        role = RoleInProject.MEMBER
        vi.spyOn(UserProject, "findOne").mockImplementation((() => Promise.resolve({ role })) as never)
        vi.spyOn(Project, "findById").mockResolvedValue({ _id: projectId, organizationId: new Types.ObjectId() } as never)
        vi.spyOn(CodeRepository, "findById").mockResolvedValue({ _id: connectionId, projectId } as never)
        vi.spyOn(Microfrontend, "exists").mockResolvedValue(null as never)
        vi.spyOn(Microfrontend, "create").mockImplementation((async (doc: unknown) => doc) as never)
        getSingle.mockResolvedValue({ slug: "vite-remote-react", type: "remote", compiler: "vite", framework: "React" })
    })

    afterEach(() => {
        vi.restoreAllMocks()
        getSingle.mockReset()
        createRepository.mockReset()
    })

    const create = (createData?: Record<string, unknown>) => {
        const service = new MicrofrontendService(user)
        const gates = service as unknown as WithGates
        vi.spyOn(gates, "ensureAccessToProject").mockResolvedValue()
        vi.spyOn(gates, "isOrganizationAdmin").mockResolvedValue(false)
        vi.spyOn(gates, "getDomainScope").mockResolvedValue(undefined)
        return service.create(
            {
                name: "Checkout",
                slug: "checkout",
                version: "1.0.0",
                host: { type: "MFE_ORCHESTRATOR_HUB" },
                codeRepository: { enabled: true, codeRepositoryId: String(connectionId), repositoryId: "", createData }
            } as unknown as MicrofrontendDTO,
            projectId.toString()
        )
    }

    it("given a connection of another project, when a microfrontend is created with it, then it is not found and nothing is created", async () => {
        vi.spyOn(CodeRepository, "findById").mockResolvedValue({ _id: connectionId, projectId: new Types.ObjectId() } as never)

        await expect(create({ name: "checkout-fe", template: "vite-remote-react" })).rejects.toBeInstanceOf(EntityNotFoundError)
        expect(createRepository).not.toHaveBeenCalled()
        expect(Microfrontend.create).not.toHaveBeenCalled()
    })

    it("given a viewer, when a microfrontend is created with a new repository, then it is refused before the repository is created", async () => {
        role = RoleInProject.VIEWER

        await expect(create({ name: "checkout-fe", template: "vite-remote-react" })).rejects.toMatchObject({ code: "REPOSITORY_CREATE_FORBIDDEN", statusCode: 403 })
        expect(createRepository).not.toHaveBeenCalled()
    })

    it("given a member, when a microfrontend is created with a new repository, then the repository is created", async () => {
        await create({ name: "checkout-fe", template: "vite-remote-react" })

        expect(createRepository).toHaveBeenCalledTimes(1)
    })

    it("given a viewer, when a microfrontend is linked to a repository that exists, then nothing asks for a role", async () => {
        role = RoleInProject.VIEWER

        await create()

        expect(UserProject.findOne).not.toHaveBeenCalled()
    })
})
