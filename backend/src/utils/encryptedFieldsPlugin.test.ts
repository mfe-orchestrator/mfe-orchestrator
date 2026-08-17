import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { transformDocument, transformUpdate } from "./encryptedFieldsPlugin"
import { decryptSecret, encryptSecret, isEncryptedSecret, resetSecretEncryptionKeyCache } from "./secretCrypto"

const originalKey = process.env.SECRETS_ENCRYPTION_KEY

beforeEach(() => {
    process.env.SECRETS_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64")
    resetSecretEncryptionKeyCache()
})

afterEach(() => {
    if (originalKey === undefined) delete process.env.SECRETS_ENCRYPTION_KEY
    else process.env.SECRETS_ENCRYPTION_KEY = originalKey
    resetSecretEncryptionKeyCache()
})

const STORAGE = { model: "Storage", paths: ["authConfig.secretAccessKey"] }
const DEPLOYMENT = { model: "Deployment", paths: ["storages.authConfig.secretAccessKey"] }

describe("transformDocument", () => {
    it("given a nested credential, when the document is encrypted, then only that field changes", () => {
        const document = { name: "prod", authConfig: { bucketName: "assets", secretAccessKey: "a-secret" } }

        transformDocument(document, STORAGE, encryptSecret)

        expect(document.name).toBe("prod")
        expect(document.authConfig.bucketName).toBe("assets")
        expect(isEncryptedSecret(document.authConfig.secretAccessKey)).toBe(true)
    })

    it("given an encrypted document, when it is decrypted, then the original value comes back", () => {
        const document = { authConfig: { secretAccessKey: "a-secret" } }

        transformDocument(document, STORAGE, encryptSecret)
        transformDocument(document, STORAGE, decryptSecret)

        expect(document.authConfig.secretAccessKey).toBe("a-secret")
    })

    /** The deployment snapshot: one path, an array of storages, every element to protect. */
    it("given a path crossing an array, when the document is encrypted, then every element is covered", () => {
        const document = {
            storages: [{ authConfig: { secretAccessKey: "first" } }, { authConfig: { secretAccessKey: "second" } }, { authConfig: { bucketName: "no-credential-here" } }]
        }

        transformDocument(document, DEPLOYMENT, encryptSecret)

        expect(isEncryptedSecret(document.storages[0].authConfig.secretAccessKey)).toBe(true)
        expect(isEncryptedSecret(document.storages[1].authConfig.secretAccessKey)).toBe(true)
        expect(document.storages[2].authConfig.bucketName).toBe("no-credential-here")
    })

    it("given the field is absent, when the document is encrypted, then nothing is invented", () => {
        const document = { authConfig: { bucketName: "assets" } } as Record<string, unknown>

        transformDocument(document, STORAGE, encryptSecret)

        expect(document.authConfig).toEqual({ bucketName: "assets" })
    })
})

describe("transformUpdate", () => {
    it("given the whole field replaced under $set, when the update is encrypted, then the credential inside it is covered", () => {
        const update = { $set: { authConfig: { bucketName: "assets", secretAccessKey: "a-secret" } } }

        transformUpdate(update, STORAGE, encryptSecret)

        expect(isEncryptedSecret(update.$set.authConfig.secretAccessKey)).toBe(true)
        expect(update.$set.authConfig.bucketName).toBe("assets")
    })

    /** The other spelling of the same write, which mongoose passes through untouched. */
    it("given the path spelled out as a dotted key, when the update is encrypted, then it is covered too", () => {
        const update = { $set: { "authConfig.secretAccessKey": "a-secret" } }

        transformUpdate(update, STORAGE, encryptSecret)

        expect(isEncryptedSecret(update.$set["authConfig.secretAccessKey"])).toBe(true)
    })

    it("given an update with no $set, when it is encrypted, then the top level is still covered", () => {
        const update = { authConfig: { secretAccessKey: "a-secret" } }

        transformUpdate(update, STORAGE, encryptSecret)

        expect(isEncryptedSecret(update.authConfig.secretAccessKey)).toBe(true)
    })

    it("given an update touching nothing protected, when it is encrypted, then it is left alone", () => {
        const update = { $set: { default: false } }

        transformUpdate(update, STORAGE, encryptSecret)

        expect(update).toEqual({ $set: { default: false } })
    })
})
