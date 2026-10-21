import { Types } from "mongoose"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import Environment from "../models/EnvironmentModel"
import Microfrontend from "../models/MicrofrontendModel"
import Service from "../models/ServiceModel"
import { ConfigMap, Secret } from "../models/VariableMapModel"
import { SECRET_PLACEHOLDER } from "../utils/secretCrypto"
import VariableMapService, { normalizeEntries } from "./VariableMapService"

const projectId = new Types.ObjectId().toString()
const development = new Types.ObjectId().toString()
const production = new Types.ObjectId().toString()

afterEach(() => {
    vi.restoreAllMocks()
})

const allowAccess = () => vi.spyOn(VariableMapService.prototype as unknown as { ensureAccessToProject: () => Promise<void> }, "ensureAccessToProject").mockResolvedValue(undefined)

describe("VariableMapService.update of a secret", () => {
    const secretId = new Types.ObjectId()
    const secret = { _id: secretId, projectId, name: "database", entries: [{ key: "DATABASE_PASSWORD", values: [{ environmentId: production, value: "stored-password" }] }] }
    let write: ReturnType<typeof vi.fn>

    beforeEach(() => {
        allowAccess()
        vi.spyOn(Secret, "findById").mockResolvedValue(secret as never)
        vi.spyOn(Secret, "exists").mockResolvedValue(null as never)
        vi.spyOn(Environment, "find").mockResolvedValue([{ _id: development }, { _id: production }] as never)
        vi.spyOn(Service, "find").mockResolvedValue([] as never)
        vi.spyOn(Microfrontend, "find").mockResolvedValue([] as never)
        write = vi.spyOn(Secret, "findByIdAndUpdate").mockResolvedValue(secret as never) as unknown as ReturnType<typeof vi.fn>
    })

    const update = (changes: object) => new VariableMapService("secret").update(String(secretId), changes)

    it("given the value sent back as the placeholder, when the secret is updated, then the stored value is kept and a retyped one replaces it", async () => {
        await update({
            entries: [
                {
                    key: "DATABASE_PASSWORD",
                    values: [
                        { environmentId: production, value: SECRET_PLACEHOLDER },
                        { environmentId: development, value: "new-dev-password" }
                    ]
                }
            ]
        })

        expect(write.mock.calls[0][1].$set.entries).toEqual([
            {
                key: "DATABASE_PASSWORD",
                values: [
                    { environmentId: production, value: "stored-password" },
                    { environmentId: development, value: "new-dev-password" }
                ]
            }
        ])
    })

    it("given a renamed key sent back as the placeholder, when the secret is updated, then it is refused and nothing is written", async () => {
        const refusal = update({ entries: [{ key: "DB_PASSWORD", values: [{ environmentId: production, value: SECRET_PLACEHOLDER }] }] })

        await expect(refusal).rejects.toMatchObject({ code: "VARIABLE_MAP_SECRET_VALUE_REQUIRED" })
        expect(write).not.toHaveBeenCalled()
    })

    it("given a name only, when the secret is updated, then it is written lowercase and no environment is read", async () => {
        await update({ name: " Orders-DB " })

        expect(Environment.find).not.toHaveBeenCalled()
        expect(write.mock.calls[0][1]).toEqual({ $set: { name: "orders-db" } })
    })

    it("given update operators and fields that are not of a map in the body, when the secret is updated, then none of them is written", async () => {
        await update({
            name: "orders-db",
            projectId: new Types.ObjectId().toString(),
            $set: { projectId: new Types.ObjectId().toString() },
            $push: { entries: { key: "PLAIN", values: [{ environmentId: production, value: "in-the-clear" }] } }
        })

        expect(write.mock.calls[0][1]).toEqual({ $set: { name: "orders-db" } })
    })

    it.each([["x".repeat(2001)], [{ $gt: "" }]])("given the description %#, when the secret is updated, then it is refused", async description => {
        await expect(update({ description })).rejects.toMatchObject({ code: "VARIABLE_MAP_DESCRIPTION_INVALID" })
        expect(write).not.toHaveBeenCalled()
    })

    it("given an invalid name, when the secret is updated, then it is refused", async () => {
        await expect(update({ name: "orders_db" })).rejects.toMatchObject({ code: "VARIABLE_MAP_NAME_INVALID" })
        expect(write).not.toHaveBeenCalled()
    })
})

describe("VariableMapService.update of a config map attached to services", () => {
    const configMapId = new Types.ObjectId()
    const otherConfigMapId = new Types.ObjectId()
    const secretId = new Types.ObjectId()
    const configMap = { _id: configMapId, projectId, name: "logging", entries: [{ key: "LOG_LEVEL", values: [] }] }
    let write: ReturnType<typeof vi.fn>

    beforeEach(() => {
        allowAccess()
        vi.spyOn(ConfigMap, "findById").mockResolvedValue(configMap as never)
        vi.spyOn(Environment, "find").mockResolvedValue([{ _id: development }] as never)
        vi.spyOn(Service, "find").mockResolvedValue([{ name: "Orders API", configMapIds: [configMapId, otherConfigMapId], secretIds: [secretId] }] as never)
        vi.spyOn(Microfrontend, "find").mockResolvedValue([] as never)
        vi.spyOn(ConfigMap, "find").mockResolvedValue([
            { _id: configMapId, name: "logging", entries: [{ key: "LOG_LEVEL" }] },
            { _id: otherConfigMapId, name: "features", entries: [{ key: "FEATURE_X" }] }
        ] as never)
        vi.spyOn(Secret, "find").mockResolvedValue([{ _id: secretId, name: "database", entries: [{ key: "DATABASE_PASSWORD" }] }] as never)
        write = vi.spyOn(ConfigMap, "findByIdAndUpdate").mockResolvedValue(configMap as never) as unknown as ReturnType<typeof vi.fn>
    })

    const update = (key: string) => new VariableMapService("configMap").update(String(configMapId), { entries: [{ key: "LOG_LEVEL" }, { key }] })

    it("given a new key no other map of those services sets, when the config map is updated, then it is written", async () => {
        await update("LOG_FORMAT")

        expect(write.mock.calls[0][1].$set.entries).toEqual([
            { key: "LOG_LEVEL", values: [] },
            { key: "LOG_FORMAT", values: [] }
        ])
    })

    it.each([
        ["a secret", "DATABASE_PASSWORD"],
        ["another config map", "FEATURE_X"]
    ])("given a new key %s of one of those services sets, when the config map is updated, then it is refused and nothing is written", async (_case, key) => {
        await expect(update(key)).rejects.toMatchObject({ code: "SERVICE_VARIABLE_KEY_DUPLICATED" })
        expect(write).not.toHaveBeenCalled()
    })

    it("given a FRONTEND that attaches it with a secret setting the new key, when the config map is updated, then it is refused and nothing is written", async () => {
        vi.spyOn(Service, "find").mockResolvedValue([] as never)
        vi.spyOn(Microfrontend, "find").mockResolvedValue([{ name: "Storefront", configMapIds: [configMapId], secretIds: [secretId] }] as never)

        await expect(update("DATABASE_PASSWORD")).rejects.toMatchObject({ code: "SERVICE_VARIABLE_KEY_DUPLICATED" })
        expect(write).not.toHaveBeenCalled()
    })
})

describe("VariableMapService.delete", () => {
    const configMapId = new Types.ObjectId()

    beforeEach(() => {
        allowAccess()
        vi.spyOn(ConfigMap, "findById").mockResolvedValue({ _id: configMapId, projectId, name: "logging", entries: [] } as never)
        vi.spyOn(Microfrontend, "find").mockResolvedValue([] as never)
    })

    it("given a config map a FRONTEND microfrontend attaches, when it is deleted, then it is refused with the microfrontend named", async () => {
        vi.spyOn(Service, "find").mockResolvedValue([] as never)
        vi.spyOn(Microfrontend, "find").mockResolvedValue([{ name: "Storefront" }] as never)
        const remove = vi.spyOn(ConfigMap, "findByIdAndDelete")

        await expect(new VariableMapService("configMap").delete(String(configMapId))).rejects.toMatchObject({ code: "VARIABLE_MAP_IN_USE", message: expect.stringContaining("Storefront") })
        expect(remove).not.toHaveBeenCalled()
    })

    it("given a config map a service attaches, when it is deleted, then it is refused with the service named", async () => {
        vi.spyOn(Service, "find").mockResolvedValue([{ name: "Orders API" }] as never)
        const remove = vi.spyOn(ConfigMap, "findByIdAndDelete")

        await expect(new VariableMapService("configMap").delete(String(configMapId))).rejects.toMatchObject({
            code: "VARIABLE_MAP_IN_USE",
            statusCode: 409,
            message: expect.stringContaining("Orders API")
        })
        expect(remove).not.toHaveBeenCalled()
    })

    it("given a config map no service attaches, when it is deleted, then it is gone", async () => {
        vi.spyOn(Service, "find").mockResolvedValue([] as never)
        const remove = vi.spyOn(ConfigMap, "findByIdAndDelete").mockResolvedValue(null)

        await new VariableMapService("configMap").delete(String(configMapId))

        expect(remove).toHaveBeenCalledWith(configMapId)
    })
})

describe("normalizeEntries", () => {
    const environment = new Types.ObjectId().toString()
    const environments = new Set([environment])

    it("given blank values and a padded key, when the entries are normalised, then the key is trimmed and the environments without a value are left out", () => {
        expect(normalizeEntries([{ key: " LOG_LEVEL ", values: [{ environmentId: environment, value: "" }] }], "configMap", environments)).toEqual([{ key: "LOG_LEVEL", values: [] }])
    })

    it("given the placeholder in a config map, when the entries are normalised, then it is an ordinary value", () => {
        expect(normalizeEntries([{ key: "BANNER", values: [{ environmentId: environment, value: SECRET_PLACEHOLDER }] }], "configMap", environments)).toEqual([
            { key: "BANNER", values: [{ environmentId: environment, value: SECRET_PLACEHOLDER }] }
        ])
    })

    it.each([
        ["an invalid key", [{ key: "my-key", values: [] }], "VARIABLE_MAP_KEY_INVALID"],
        [
            "a key used twice",
            [
                { key: "A", values: [] },
                { key: "A", values: [] }
            ],
            "VARIABLE_MAP_KEY_DUPLICATED"
        ],
        [
            "two values for one environment",
            [
                {
                    key: "A",
                    values: [
                        { environmentId: environment, value: "1" },
                        { environmentId: environment, value: "2" }
                    ]
                }
            ],
            "VARIABLE_MAP_ENVIRONMENT_DUPLICATED"
        ],
        ["a value for an environment of another project", [{ key: "A", values: [{ environmentId: new Types.ObjectId().toString(), value: "1" }] }], "VARIABLE_MAP_ENVIRONMENT_UNKNOWN"],
        ["a value too long", [{ key: "A", values: [{ environmentId: environment, value: "x".repeat(32 * 1024 + 1) }] }], "VARIABLE_MAP_VALUE_TOO_LONG"],
        ["something that is not a list", { key: "A" }, "VARIABLE_MAP_ENTRIES_INVALID"]
    ])("given %s, when the entries are normalised, then they are refused", (_case, entries, code) => {
        expect(() => normalizeEntries(entries, "configMap", environments)).toThrow(expect.objectContaining({ code }))
    })

    it("given a null value, when the entries are normalised, then it is skipped rather than crashing", () => {
        expect(normalizeEntries([{ key: "A", values: [null] }], "configMap", environments)).toEqual([{ key: "A", values: [] }])
    })

    it("given a secret that looks like a ciphertext, when the entries are normalised, then it is refused", () => {
        const refusal = () => normalizeEntries([{ key: "A", values: [{ environmentId: environment, value: "enc:v1:a:b:c" }] }], "secret", environments)

        expect(refusal).toThrow(expect.objectContaining({ code: "VARIABLE_MAP_VALUE_INVALID" }))
    })
})

describe("VariableMapService create and update of a map", () => {
    const mapId = new Types.ObjectId()
    const map = { _id: mapId, projectId, name: "orders", entries: [{ key: "LOG_LEVEL", values: [{ environmentId: production, value: "info" }] }] }

    beforeEach(() => {
        allowAccess()
        vi.spyOn(VariableMapService.prototype as unknown as { ensureWholeProject: () => Promise<void> }, "ensureWholeProject").mockResolvedValue(undefined)
        vi.spyOn(ConfigMap, "findById").mockResolvedValue(map as never)
        vi.spyOn(Environment, "find").mockResolvedValue([{ _id: development }, { _id: production }] as never)
        vi.spyOn(Service, "find").mockResolvedValue([] as never)
        vi.spyOn(Microfrontend, "find").mockResolvedValue([] as never)
    })

    it("given a name, when a map is created, then it is written to the database for the project", async () => {
        const create = vi.spyOn(ConfigMap, "create").mockResolvedValue(map as never)

        await new VariableMapService("configMap").create({ name: "orders" }, projectId)

        expect(create.mock.calls[0][0]).toMatchObject({ name: "orders", entries: [], projectId: expect.anything() })
    })

    it("given a name already taken, when a map is created, then the unique index error is refused as VARIABLE_MAP_NAME_TAKEN", async () => {
        vi.spyOn(ConfigMap, "create").mockRejectedValue({ code: 11000 })

        await expect(new VariableMapService("configMap").create({ name: "orders" }, projectId)).rejects.toMatchObject({ code: "VARIABLE_MAP_NAME_TAKEN" })
    })

    it("given a name already taken, when a map is renamed, then the unique index error is refused as VARIABLE_MAP_NAME_TAKEN", async () => {
        vi.spyOn(ConfigMap, "findByIdAndUpdate").mockRejectedValue({ code: 11000 })

        await expect(new VariableMapService("configMap").update(mapId.toString(), { name: "billing" })).rejects.toMatchObject({ code: "VARIABLE_MAP_NAME_TAKEN" })
    })

    it("given a rename, when the map is updated, then the new name is written to the database", async () => {
        const write = vi.spyOn(ConfigMap, "findByIdAndUpdate").mockResolvedValue(map as never)

        await new VariableMapService("configMap").update(mapId.toString(), { name: "billing" })

        expect(write.mock.calls[0][1]).toEqual({ $set: { name: "billing" } })
    })

    it("given a map, when it is deleted, then it is removed from the database", async () => {
        vi.spyOn(ConfigMap, "findByIdAndDelete").mockResolvedValue(map as never)

        await new VariableMapService("configMap").delete(mapId.toString())

        expect(ConfigMap.findByIdAndDelete).toHaveBeenCalledWith(mapId)
    })
})
