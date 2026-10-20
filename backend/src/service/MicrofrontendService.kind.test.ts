import { Types } from "mongoose"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("..", () => ({
    fastify: { log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }, config: {} }
}))

import { ApiKeyRole } from "../models/ApiKeyModel"
import BuiltFrontend from "../models/BuiltFrontendModel"
import Environment from "../models/EnvironmentModel"
import FrontendDeployment from "../models/FrontendDeploymentModel"
import Microfrontend, { HostedOn, MicrofrontendKind } from "../models/MicrofrontendModel"
import Project from "../models/ProjectModel"
import MicrofrontendDTO from "../types/MicrofrontendDTO"
import FrontendDeploymentService from "./FrontendDeploymentService"
import MicrofrontendService from "./MicrofrontendService"

const projectId = new Types.ObjectId()

afterEach(() => {
    vi.restoreAllMocks()
})

const codeOf = async (promise: Promise<unknown>) => {
    try {
        await promise
    } catch (error) {
        return (error as { code?: string }).code
    }
    throw new Error("expected a refusal")
}

describe("MicrofrontendService.create, kind", () => {
    const create = async (dto: Partial<MicrofrontendDTO>) => {
        const service = new MicrofrontendService()
        vi.spyOn(service as unknown as { ensureAccessToProject: () => Promise<void> }, "ensureAccessToProject").mockResolvedValue()
        vi.spyOn(Microfrontend, "exists").mockResolvedValue(null as never)
        const write = vi.spyOn(Microfrontend, "create").mockImplementation((async (doc: unknown) => doc) as never)
        await service.create({ name: "Shell", slug: "shell", version: "1.0.0", host: { type: HostedOn.MFE_ORCHESTRATOR_HUB }, ...dto } as unknown as MicrofrontendDTO, String(projectId))
        return write
    }

    it("given a FRONTEND with parents, when it is created, then it is refused before anything is written", async () => {
        const exists = vi.spyOn(Microfrontend, "exists")
        const write = vi.spyOn(Microfrontend, "create")
        const service = new MicrofrontendService()
        vi.spyOn(service as unknown as { ensureAccessToProject: () => Promise<void> }, "ensureAccessToProject").mockResolvedValue()

        const code = await codeOf(
            service.create({ name: "Shell", slug: "shell", version: "1.0.0", kind: MicrofrontendKind.FRONTEND, parentIds: [String(new Types.ObjectId())] } as MicrofrontendDTO, String(projectId))
        )

        expect(code).toBe("FRONTEND_CANNOT_HAVE_PARENTS")
        expect(exists).not.toHaveBeenCalled()
        expect(write).not.toHaveBeenCalled()
    })

    it("given a FRONTEND without parents, when it is created, then it gets the service defaults it was not given", async () => {
        const write = await create({ kind: MicrofrontendKind.FRONTEND, parentIds: [], readinessPath: "/ready" })

        expect(write.mock.calls[0][0]).toMatchObject({ kind: MicrofrontendKind.FRONTEND, port: 8080, livenessPath: "/health/live", readinessPath: "/ready" })
    })

    it("given a MICROFRONTEND with parents, when it is created, then it is written without container fields", async () => {
        const parentId = String(new Types.ObjectId())
        const write = await create({ parentIds: [parentId] })

        const written = write.mock.calls[0][0] as Record<string, unknown>
        expect(written.parentIds).toEqual([parentId])
        expect(written).not.toHaveProperty("port")
        expect(written).not.toHaveProperty("livenessPath")
    })

    it("given a FRONTEND without a version, when it is created, then it is written without one", async () => {
        const write = await create({ kind: MicrofrontendKind.FRONTEND, version: undefined })

        expect((write.mock.calls[0][0] as Record<string, unknown>).version).toBeUndefined()
    })

    it("given a MICROFRONTEND without a version, when it is created, then it is refused", async () => {
        const service = new MicrofrontendService()
        vi.spyOn(service as unknown as { ensureAccessToProject: () => Promise<void> }, "ensureAccessToProject").mockResolvedValue()

        expect(await codeOf(service.create({ name: "Cart", slug: "cart" } as MicrofrontendDTO, String(projectId)))).toBe("MICROFRONTEND_VERSION_REQUIRED")
    })

    it("given an update operator, when a microfrontend is created, then it is refused as a microfrontend", async () => {
        const service = new MicrofrontendService()
        vi.spyOn(service as unknown as { ensureAccessToProject: () => Promise<void> }, "ensureAccessToProject").mockResolvedValue()

        await expect(service.create({ name: "Cart", slug: "cart", version: "1.0.0", $set: { secretIds: [] } } as unknown as MicrofrontendDTO, String(projectId))).rejects.toMatchObject({
            code: "MICROFRONTEND_INVALID",
            message: expect.not.stringContaining("service")
        })
    })

    it("given a kind that does not exist, when it is created, then it is refused", async () => {
        const service = new MicrofrontendService()
        vi.spyOn(service as unknown as { ensureAccessToProject: () => Promise<void> }, "ensureAccessToProject").mockResolvedValue()

        expect(await codeOf(service.create({ name: "Shell", slug: "shell", version: "1.0.0", kind: "STATIC" } as unknown as MicrofrontendDTO, String(projectId)))).toBe("MICROFRONTEND_KIND_INVALID")
    })
})

describe("MicrofrontendService.update, kind", () => {
    const existing = (fields: Record<string, unknown>) => ({ _id: new Types.ObjectId(), projectId, slug: "shell", kind: MicrofrontendKind.MICROFRONTEND, ...fields })

    const serviceFor = (microfrontend: Record<string, unknown>) => {
        const service = new MicrofrontendService()
        vi.spyOn(service, "getById").mockResolvedValue(microfrontend as never)
        vi.spyOn(service, "ensureAccessToMicrofrontend").mockResolvedValue()
        return service
    }

    it("given a FRONTEND, when parents are given to it, then it is refused before anything is written", async () => {
        const write = vi.spyOn(Microfrontend, "findByIdAndUpdate")
        const microfrontend = existing({ kind: MicrofrontendKind.FRONTEND })

        const code = await codeOf(serviceFor(microfrontend).update(String(microfrontend._id), { parentIds: [String(new Types.ObjectId())] } as MicrofrontendDTO))

        expect(code).toBe("FRONTEND_CANNOT_HAVE_PARENTS")
        expect(write).not.toHaveBeenCalled()
    })

    it("given a microfrontend with parents, when it is made a FRONTEND, then it is refused", async () => {
        const write = vi.spyOn(Microfrontend, "findByIdAndUpdate")
        const microfrontend = existing({ parentIds: [new Types.ObjectId()] })

        const code = await codeOf(serviceFor(microfrontend).update(String(microfrontend._id), { kind: MicrofrontendKind.FRONTEND } as MicrofrontendDTO))

        expect(code).toBe("FRONTEND_CANNOT_HAVE_PARENTS")
        expect(write).not.toHaveBeenCalled()
    })

    it("given a microfrontend with parents, when it is made a FRONTEND and its parents are removed together, then it is written with the defaults and validated", async () => {
        const write = vi.spyOn(Microfrontend, "findByIdAndUpdate").mockImplementation((async (_id: unknown, update: unknown) => update) as never)
        const microfrontend = existing({ parentIds: [new Types.ObjectId()] })

        await serviceFor(microfrontend).update(String(microfrontend._id), { kind: MicrofrontendKind.FRONTEND, parentIds: [] } as unknown as MicrofrontendDTO)

        expect(write.mock.calls[0][1]).toMatchObject({ kind: MicrofrontendKind.FRONTEND, parentIds: [], port: 8080, livenessPath: "/health/live", readinessPath: "/health/ready" })
        expect(write.mock.calls[0][2]).toMatchObject({ new: true, runValidators: true })
    })

    it("given a MICROFRONTEND, when it is updated, then the update runs the validators", async () => {
        const write = vi.spyOn(Microfrontend, "findByIdAndUpdate").mockImplementation((async (_id: unknown, update: unknown) => update) as never)
        const microfrontend = existing({})

        await serviceFor(microfrontend).update(String(microfrontend._id), { name: "Cart" } as MicrofrontendDTO)

        expect(write.mock.calls[0][2]).toMatchObject({ new: true, runValidators: true })
    })

    it("given a microfrontend with no parents, when it is made a FRONTEND, then the write requires no parents stored and its canary is turned off", async () => {
        const write = vi.spyOn(Microfrontend, "findOneAndUpdate").mockImplementation((async (_filter: unknown, update: unknown) => update) as never)
        const microfrontend = existing({ canary: { enabled: true, percentage: 10 } })

        await serviceFor(microfrontend).update(String(microfrontend._id), { kind: MicrofrontendKind.FRONTEND } as MicrofrontendDTO)

        const [filter, update] = write.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, unknown>]
        expect(filter).toEqual({ _id: microfrontend._id, $or: [{ parentIds: { $exists: false } }, { parentIds: { $size: 0 } }] })
        expect(update).toMatchObject({ kind: MicrofrontendKind.FRONTEND, "canary.enabled": false })
    })

    it("given a FRONTEND, when a canary is sent enabled, then it is stored disabled", async () => {
        const write = vi.spyOn(Microfrontend, "findOneAndUpdate").mockImplementation((async (_filter: unknown, update: unknown) => update) as never)
        const microfrontend = existing({ kind: MicrofrontendKind.FRONTEND })

        await serviceFor(microfrontend).update(String(microfrontend._id), { canary: { enabled: true, percentage: 50 } } as unknown as MicrofrontendDTO)

        expect(write.mock.calls[0][1]).toMatchObject({ canary: { enabled: false, percentage: 50 } })
    })

    /** A relation set between the check and the write: the conditional write misses */
    it("given a parent set since it was read, when it is made a FRONTEND, then it is refused", async () => {
        vi.spyOn(Microfrontend, "findOneAndUpdate").mockResolvedValue(null as never)
        const microfrontend = existing({})

        expect(await codeOf(serviceFor(microfrontend).update(String(microfrontend._id), { kind: MicrofrontendKind.FRONTEND } as MicrofrontendDTO))).toBe("FRONTEND_CANNOT_HAVE_PARENTS")
    })

    it("given an update operator, when a microfrontend is updated, then it is refused as a microfrontend", async () => {
        const write = vi.spyOn(Microfrontend, "findByIdAndUpdate")
        const microfrontend = existing({})

        expect(await codeOf(serviceFor(microfrontend).update(String(microfrontend._id), { "canary.enabled": true } as unknown as MicrofrontendDTO))).toBe("MICROFRONTEND_INVALID")
        expect(write).not.toHaveBeenCalled()
    })
})

describe("MicrofrontendService.setRelation, kind", () => {
    const microfrontendOf = (kind: MicrofrontendKind) => ({ _id: new Types.ObjectId(), projectId, slug: kind.toLowerCase(), kind })

    const serviceFor = (host: ReturnType<typeof microfrontendOf>, remote: ReturnType<typeof microfrontendOf>) => {
        const service = new MicrofrontendService()
        vi.spyOn(service, "getById").mockImplementation((async (id: string) => (id === String(host._id) ? host : remote)) as never)
        vi.spyOn(service, "ensureAccessToMicrofrontend").mockResolvedValue()
        return service
    }

    it("given a FRONTEND as the remote, when it is linked to a host, then it is refused and nothing is written", async () => {
        const write = vi.spyOn(Microfrontend, "findOneAndUpdate")
        const host = microfrontendOf(MicrofrontendKind.MICROFRONTEND)
        const remote = microfrontendOf(MicrofrontendKind.FRONTEND)

        expect(await codeOf(serviceFor(host, remote).setRelation(String(host._id), String(remote._id)))).toBe("FRONTEND_CANNOT_HAVE_PARENTS")
        expect(write).not.toHaveBeenCalled()
    })

    it("given a FRONTEND as the host, when a microfrontend is linked to it, then the parent is added only to a remote that is not a FRONTEND", async () => {
        const host = microfrontendOf(MicrofrontendKind.FRONTEND)
        const remote = microfrontendOf(MicrofrontendKind.MICROFRONTEND)
        const write = vi.spyOn(Microfrontend, "findOneAndUpdate").mockResolvedValue({ ...remote, parentIds: [host._id] } as never)

        const saved = await serviceFor(host, remote).setRelation(String(host._id), String(remote._id))

        expect(write).toHaveBeenCalledWith({ _id: remote._id, kind: { $ne: MicrofrontendKind.FRONTEND } }, { $addToSet: { parentIds: host._id } }, { new: true })
        expect(saved.parentIds?.map(String)).toEqual([String(host._id)])
    })

    /** Made a FRONTEND between the check and the write: the conditional write misses */
    it("given a remote made a FRONTEND since it was read, when it is linked, then it is refused", async () => {
        vi.spyOn(Microfrontend, "findOneAndUpdate").mockResolvedValue(null as never)
        const host = microfrontendOf(MicrofrontendKind.MICROFRONTEND)
        const remote = microfrontendOf(MicrofrontendKind.MICROFRONTEND)

        expect(await codeOf(serviceFor(host, remote).setRelation(String(host._id), String(remote._id)))).toBe("FRONTEND_CANNOT_HAVE_PARENTS")
    })
})

describe("MicrofrontendService.getVersionsById, kind", () => {
    it.each([
        [MicrofrontendKind.MICROFRONTEND, false],
        [MicrofrontendKind.FRONTEND, true]
    ])("given a %s, when its versions are read, then only the builds of that kind count", async (kind, withImage) => {
        const microfrontend = { _id: new Types.ObjectId(), projectId, kind }
        const service = new MicrofrontendService()
        vi.spyOn(service, "getById").mockResolvedValue(microfrontend as never)
        const distinct = vi.fn().mockResolvedValue(["1.0.0"])
        const find = vi.spyOn(BuiltFrontend, "find").mockReturnValue({ select: () => ({ distinct }) } as never)

        expect(await service.getVersionsById(String(microfrontend._id))).toEqual(["1.0.0"])
        expect(find).toHaveBeenCalledWith({ microfrontendId: microfrontend._id, image: { $exists: withImage } })
    })
})

describe("MicrofrontendService.uploadWithPermissionCheck, kind", () => {
    it("given a FRONTEND, when a bundle is uploaded, then it is refused before the file is read", async () => {
        vi.spyOn(Project, "findById").mockResolvedValue({ _id: projectId, slug: "acme" } as never)
        vi.spyOn(Microfrontend, "findOne").mockResolvedValue({ _id: new Types.ObjectId(), slug: "shell", kind: MicrofrontendKind.FRONTEND, host: { type: HostedOn.MFE_ORCHESTRATOR_HUB } } as never)
        const built = vi.spyOn(BuiltFrontend, "create")
        const file = { mimetype: "application/zip", filename: "shell.zip", toBuffer: vi.fn() }

        const code = await codeOf(new MicrofrontendService().uploadWithPermissionCheck("shell", "1.0.0", String(projectId), file as never))

        expect(code).toBe("FRONTEND_UPLOAD_NOT_ALLOWED")
        expect(file.toBuffer).not.toHaveBeenCalled()
        expect(built).not.toHaveBeenCalled()
    })
})

describe("MicrofrontendService.registerVersionWithPermissionCheck", () => {
    const microfrontendId = new Types.ObjectId()
    let findOne: ReturnType<typeof vi.fn>
    let upsert: ReturnType<typeof vi.fn>
    let updateOne: ReturnType<typeof vi.fn>

    beforeEach(() => {
        vi.spyOn(Project, "findById").mockResolvedValue({ _id: projectId } as never)
        findOne = vi.spyOn(Microfrontend, "findOne").mockResolvedValue({ _id: microfrontendId, slug: "shell", kind: MicrofrontendKind.FRONTEND, version: "1.1.0" } as never) as unknown as ReturnType<
            typeof vi.fn
        >
        upsert = vi
            .spyOn(BuiltFrontend, "findOneAndUpdate")
            .mockImplementation((async (_filter: unknown, update: { $set: Record<string, unknown> }) => ({ microfrontendId, ...update.$set })) as never) as unknown as ReturnType<typeof vi.fn>
        updateOne = vi.spyOn(Microfrontend, "updateOne").mockResolvedValue({ matchedCount: 1 } as never) as unknown as ReturnType<typeof vi.fn>
    })

    const register = (body: unknown, role?: ApiKeyRole) => new MicrofrontendService().registerVersionWithPermissionCheck("shell", "1.2.0", String(projectId), body, role)

    it.each([[ApiKeyRole.VIEWER], [undefined]])("given a %s key, when a version is registered, then it is forbidden before anything is read", async role => {
        await expect(register({ image: "ghcr.io/acme/shell:1.2.0" }, role)).rejects.toMatchObject({ statusCode: 403, code: "MICROFRONTEND_VERSION_FORBIDDEN" })
        expect(findOne).not.toHaveBeenCalled()
    })

    it("given a MICROFRONTEND, when a version is registered, then it is refused and nothing is stored", async () => {
        findOne.mockResolvedValue({ _id: microfrontendId, slug: "cart", kind: MicrofrontendKind.MICROFRONTEND })

        expect(await codeOf(register({ image: "ghcr.io/acme/cart:1.2.0" }, ApiKeyRole.MANAGER))).toBe("MICROFRONTEND_VERSION_REGISTRATION_NOT_ALLOWED")
        expect(upsert).not.toHaveBeenCalled()
        expect(updateOne).not.toHaveBeenCalled()
    })

    it("given no image, when a version is registered, then it is refused", async () => {
        expect(await codeOf(register({}, ApiKeyRole.MANAGER))).toBe("SERVICE_VERSION_IMAGE_REQUIRED")
    })

    it("given a FRONTEND and a newer version, when it is registered, then it is upserted, becomes the version and teaches the image repository", async () => {
        const built = await register({ image: "ghcr.io/acme/shell:1.2.0", digest: "sha256:abc", commitSha: "deadbeef" }, ApiKeyRole.MANAGER)

        expect(upsert).toHaveBeenCalledWith(
            { microfrontendId, version: "1.2.0" },
            { $set: { image: "ghcr.io/acme/shell:1.2.0", digest: "sha256:abc", commitSha: "deadbeef" } },
            expect.objectContaining({ upsert: true })
        )
        expect(built).toMatchObject({ image: "ghcr.io/acme/shell:1.2.0", digest: "sha256:abc", commitSha: "deadbeef" })
        expect(updateOne).toHaveBeenCalledWith({ _id: microfrontendId, version: "1.1.0" }, { $set: { version: "1.2.0", "image.repository": "ghcr.io/acme/shell" } })
    })

    it("given a FRONTEND created without a version, when a first one is registered, then it becomes its version", async () => {
        findOne.mockResolvedValue({ _id: microfrontendId, slug: "shell", kind: MicrofrontendKind.FRONTEND, image: { repository: "ghcr.io/acme/shell" } })

        await register({ image: "ghcr.io/acme/shell:nightly" }, ApiKeyRole.MANAGER)

        expect(updateOne).toHaveBeenCalledWith({ _id: microfrontendId, version: null }, { $set: { version: "1.2.0" } })
    })

    it("given an older version, when it is registered, then it is stored but the FRONTEND keeps its version", async () => {
        findOne.mockResolvedValue({ _id: microfrontendId, slug: "shell", kind: MicrofrontendKind.FRONTEND, version: "2.0.0", image: { repository: "ghcr.io/acme/shell" } })

        await register({ image: "ghcr.io/acme/shell:1.2.0" }, ApiKeyRole.MANAGER)

        expect(upsert).toHaveBeenCalled()
        expect(updateOne).not.toHaveBeenCalled()
    })
})

describe("FrontendDeploymentService.registerWithPermissionCheck", () => {
    const environment = { _id: new Types.ObjectId(), slug: "PROD" }

    beforeEach(() => {
        vi.spyOn(Environment, "find").mockResolvedValue([environment] as never)
    })

    it("given a MICROFRONTEND, when a deploy is reported, then it is refused and nothing is stored", async () => {
        vi.spyOn(Microfrontend, "findOne").mockResolvedValue({ _id: new Types.ObjectId(), slug: "cart", kind: MicrofrontendKind.MICROFRONTEND } as never)
        const write = vi.spyOn(FrontendDeployment, "create")

        const code = await codeOf(new FrontendDeploymentService().registerWithPermissionCheck("cart", "prod", String(projectId), { version: "1.0.0" }, ApiKeyRole.MANAGER))

        expect(code).toBe("MICROFRONTEND_DEPLOYMENT_REGISTRATION_NOT_ALLOWED")
        expect(write).not.toHaveBeenCalled()
    })

    it("given a FRONTEND, when a deploy is reported, then it is stored against the environment matched without regard to case", async () => {
        const microfrontendId = new Types.ObjectId()
        vi.spyOn(Microfrontend, "findOne").mockResolvedValue({ _id: microfrontendId, slug: "shell", kind: MicrofrontendKind.FRONTEND } as never)
        const write = vi.spyOn(FrontendDeployment, "create").mockImplementation((async (doc: unknown) => doc) as never)

        await new FrontendDeploymentService().registerWithPermissionCheck("shell", "prod", String(projectId), { version: "1.2.0", image: "ghcr.io/acme/shell:1.2.0" }, ApiKeyRole.MANAGER)

        expect(write).toHaveBeenCalledWith({ microfrontendId, environmentId: environment._id, version: "1.2.0", image: "ghcr.io/acme/shell:1.2.0" })
    })

    it("given a VIEWER key, when a deploy is reported, then it is forbidden", async () => {
        await expect(new FrontendDeploymentService().registerWithPermissionCheck("shell", "prod", String(projectId), { version: "1.2.0" }, ApiKeyRole.VIEWER)).rejects.toMatchObject({
            statusCode: 403,
            code: "MICROFRONTEND_DEPLOYMENT_FORBIDDEN"
        })
    })
})
