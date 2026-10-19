import { Types } from "mongoose"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import Service from "../models/ServiceModel"
import { ConfigMap, Secret } from "../models/VariableMapModel"
import { moveServiceVariablesToMaps, removeAssistantConversationExpiry } from "./migrations"
import { encryptSecret, resetSecretEncryptionKeyCache } from "./secretCrypto"

const dropIndex = vi.fn()
const updateMany = vi.fn()

vi.mock("../models/AssistantConversationModel", () => ({
    default: { collection: { dropIndex: (...args: unknown[]) => dropIndex(...args), updateMany: (...args: unknown[]) => updateMany(...args) } }
}))

const logger = { info: vi.fn(), error: vi.fn() } as never

describe("removeAssistantConversationExpiry", () => {
    beforeEach(() => {
        dropIndex.mockReset().mockResolvedValue(undefined)
        updateMany.mockReset().mockResolvedValue({ modifiedCount: 0 })
    })

    it("Given the expiry index of the first version, when it runs, then the index and the expiry dates are removed", async () => {
        updateMany.mockResolvedValue({ modifiedCount: 3 })

        await removeAssistantConversationExpiry(logger)

        expect(dropIndex).toHaveBeenCalledWith("expiresAt_1")
        expect(updateMany).toHaveBeenCalledWith({ expiresAt: { $exists: true } }, { $unset: { expiresAt: "" } })
    })

    it.each([
        ["the index is already gone", 27],
        ["the collection does not exist yet", 26]
    ])("Given %s, when it runs, then it carries on", async (_, code) => {
        dropIndex.mockRejectedValue(Object.assign(new Error("not found"), { code }))

        await expect(removeAssistantConversationExpiry(logger)).resolves.toBeUndefined()
        expect(updateMany).toHaveBeenCalled()
    })

    it("Given any other failure on the drop, when it runs, then the error is not swallowed", async () => {
        dropIndex.mockRejectedValue(Object.assign(new Error("not authorized"), { code: 13 }))

        await expect(removeAssistantConversationExpiry(logger)).rejects.toThrow("not authorized")
    })
})

describe("moveServiceVariablesToMaps", () => {
    const originalKey = process.env.SECRETS_ENCRYPTION_KEY
    const projectId = new Types.ObjectId()
    const serviceId = new Types.ObjectId()
    const environmentId = new Types.ObjectId()
    const configMapId = new Types.ObjectId()
    const secretId = new Types.ObjectId()
    let updateOne: ReturnType<typeof vi.fn>

    const holding = (fields: object) => {
        vi.spyOn(Service.collection, "find").mockReturnValue([{ _id: serviceId, projectId, slug: "orders-", ...fields }] as never)
    }
    const duplicateKey = () => Object.assign(new Error("E11000"), { code: 11000 })
    const migrationLogger = { info: vi.fn(), error: vi.fn() }

    beforeEach(() => {
        migrationLogger.error.mockClear()
        process.env.SECRETS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64")
        resetSecretEncryptionKeyCache()
        vi.spyOn(ConfigMap, "findOne").mockResolvedValue(null)
        vi.spyOn(Secret, "findOne").mockResolvedValue(null)
        vi.spyOn(ConfigMap, "create").mockResolvedValue({ _id: configMapId } as never)
        vi.spyOn(Secret, "create").mockResolvedValue({ _id: secretId } as never)
        updateOne = vi.spyOn(Service.collection, "updateOne").mockResolvedValue({} as never) as unknown as ReturnType<typeof vi.fn>
    })

    afterEach(() => {
        vi.restoreAllMocks()
        if (originalKey === undefined) delete process.env.SECRETS_ENCRYPTION_KEY
        else process.env.SECRETS_ENCRYPTION_KEY = originalKey
        resetSecretEncryptionKeyCache()
    })

    it("Given a service holding a config map and secrets encrypted inside it, when it runs, then both become maps named after it, readable again, attached, and the fields go", async () => {
        const encrypted = encryptSecret("hunter2", "Service:secrets.values.value")
        holding({
            configMap: [{ key: "LOG_LEVEL", values: [{ environmentId, value: "debug" }] }],
            secrets: [{ key: "DATABASE_PASSWORD", values: [{ environmentId, value: encrypted }] }]
        })

        await moveServiceVariablesToMaps(migrationLogger as never)

        expect(ConfigMap.create).toHaveBeenCalledWith(expect.objectContaining({ projectId, name: "orders", entries: [{ key: "LOG_LEVEL", values: [{ environmentId, value: "debug" }] }] }))
        expect(Secret.create).toHaveBeenCalledWith(expect.objectContaining({ name: "orders", entries: [{ key: "DATABASE_PASSWORD", values: [{ environmentId, value: "hunter2" }] }] }))
        expect(updateOne).toHaveBeenCalledWith({ _id: serviceId }, { $addToSet: { configMapIds: { $each: [configMapId] }, secretIds: { $each: [secretId] } }, $unset: { configMap: "", secrets: "" } })
    })

    it("Given a rerun after the map was created but before the service was updated, when it runs, then the existing map is attached and no other is created", async () => {
        holding({ configMap: [{ key: "LOG_LEVEL", values: [] }], secrets: [] })
        vi.spyOn(ConfigMap, "findOne").mockResolvedValue({ _id: configMapId } as never)

        await moveServiceVariablesToMaps(migrationLogger as never)

        expect(ConfigMap.findOne).toHaveBeenCalledWith({ projectId, description: `Moved from the service orders- (${serviceId})` }, { _id: 1 })
        expect(ConfigMap.create).not.toHaveBeenCalled()
        expect(Secret.create).not.toHaveBeenCalled()
        expect(updateOne.mock.calls[0][1].$addToSet).toEqual({ configMapIds: { $each: [configMapId] }, secretIds: { $each: [] } })
    })

    it("Given another map already holding the name, when it runs, then a name of its own is used and the other map is left alone", async () => {
        holding({ configMap: [{ key: "LOG_LEVEL", values: [] }], secrets: null })
        const create = vi.fn().mockRejectedValueOnce(duplicateKey()).mockResolvedValueOnce({ _id: configMapId })
        vi.spyOn(ConfigMap, "create").mockImplementation(create as never)

        await moveServiceVariablesToMaps(migrationLogger as never)

        expect(create.mock.calls.map(([map]) => map.name)).toEqual(["orders", `orders-${String(serviceId).slice(-6)}`])
        expect(updateOne.mock.calls[0][1].$addToSet.configMapIds).toEqual({ $each: [configMapId] })
    })

    it("Given a secret the key cannot read, when it runs, then that service keeps its values and the next one is still moved", async () => {
        const otherId = new Types.ObjectId()
        vi.spyOn(Service.collection, "find").mockReturnValue([
            { _id: serviceId, projectId, slug: "broken", secrets: [{ key: "A", values: [{ environmentId, value: "enc:v1:a:b:c" }] }] },
            { _id: otherId, projectId, slug: "orders", configMap: [{ key: "LOG_LEVEL", values: [] }] }
        ] as never)

        await moveServiceVariablesToMaps(migrationLogger as never)

        expect(migrationLogger.error).toHaveBeenCalledTimes(1)
        expect(updateOne).toHaveBeenCalledTimes(1)
        expect(updateOne.mock.calls[0][0]).toEqual({ _id: otherId })
    })
})
