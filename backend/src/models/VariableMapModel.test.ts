import { Types } from "mongoose"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { transformDocument } from "../utils/encryptedFieldsPlugin"
import { decryptSecret, encryptSecret, isEncryptedSecret, resetSecretEncryptionKeyCache, SECRET_PLACEHOLDER } from "../utils/secretCrypto"
import { ConfigMap, SECRET_ENCRYPTED_PATHS, Secret } from "./VariableMapModel"

describe.each([
    ["ConfigMap", ConfigMap],
    ["Secret", Secret]
])("%s model", (_name, Model) => {
    it("given a name with capitals and spaces, when it is built, then it is stored trimmed and lowercase, with no entries", async () => {
        const map = new Model({ projectId: new Types.ObjectId(), name: "  Orders-Database " })

        expect(map.name).toBe("orders-database")
        expect(map.entries).toEqual([])
        await expect(map.validate()).resolves.toBeUndefined()
    })

    it.each([["-orders"], ["orders-"], ["orders_db"], ["x".repeat(64)]])("given the name %j, when it is validated, then it is refused", async name => {
        const map = new Model({ projectId: new Types.ObjectId(), name })

        await expect(map.validate()).rejects.toMatchObject({ errors: { name: expect.anything() } })
    })

    it("given a key starting with a digit, when it is validated, then it is refused", async () => {
        const map = new Model({ projectId: new Types.ObjectId(), name: "orders", entries: [{ key: "1_URL", values: [] }] })

        await expect(map.validate()).rejects.toMatchObject({ errors: { "entries.0.key": expect.anything() } })
    })

    it("declares the name unique inside its project", () => {
        expect(Model.schema.indexes()).toContainEqual([{ name: 1, projectId: 1 }, expect.objectContaining({ unique: true })])
    })
})

describe("serialisation", () => {
    const environmentId = new Types.ObjectId()
    const entries = [{ key: "DATABASE_PASSWORD", values: [{ environmentId, value: "hunter2" }] }]

    it("given a config map, when it is serialised, then its values are sent", () => {
        const json = JSON.parse(JSON.stringify(new ConfigMap({ projectId: new Types.ObjectId(), name: "orders", entries })))

        expect(json.entries).toEqual([{ key: "DATABASE_PASSWORD", values: [{ environmentId: String(environmentId), value: "hunter2" }] }])
    })

    it("given a secret, when it is serialised, then every value is the placeholder and the document keeps it", () => {
        const secret = new Secret({ projectId: new Types.ObjectId(), name: "orders", entries })

        const json = JSON.parse(JSON.stringify(secret))

        expect(json.entries).toEqual([{ key: "DATABASE_PASSWORD", values: [{ environmentId: String(environmentId), value: SECRET_PLACEHOLDER }] }])
        expect(secret.entries[0].values[0].value).toBe("hunter2")
    })
})

describe("Secret model with a key configured", () => {
    const originalKey = process.env.SECRETS_ENCRYPTION_KEY

    beforeEach(() => {
        process.env.SECRETS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64")
        resetSecretEncryptionKeyCache()
    })

    afterEach(() => {
        if (originalKey === undefined) delete process.env.SECRETS_ENCRYPTION_KEY
        else process.env.SECRETS_ENCRYPTION_KEY = originalKey
        resetSecretEncryptionKeyCache()
    })

    it("given values in two environments, when they are encrypted and decrypted, then every value goes through it", () => {
        const options = { model: "Secret", paths: SECRET_ENCRYPTED_PATHS }
        const secret = new Secret({
            projectId: new Types.ObjectId(),
            name: "orders",
            entries: [
                {
                    key: "API_TOKEN",
                    values: [
                        { environmentId: new Types.ObjectId(), value: "dev-token" },
                        { environmentId: new Types.ObjectId(), value: "prod-token" }
                    ]
                }
            ]
        })

        transformDocument(secret, options, encryptSecret)

        expect(secret.entries[0].values.every(({ value }) => isEncryptedSecret(value))).toBe(true)

        transformDocument(secret, options, decryptSecret)

        expect(secret.entries[0].values.map(({ value }) => value)).toEqual(["dev-token", "prod-token"])
    })
})
