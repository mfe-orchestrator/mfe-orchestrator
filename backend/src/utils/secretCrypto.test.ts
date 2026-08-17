import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { decryptSecret, encryptSecret, isEncryptedSecret, isSecretEncryptionEnabled, resetSecretEncryptionKeyCache, SecretEncryptionError } from "./secretCrypto"

const KEY = Buffer.alloc(32, 7).toString("base64")
const OTHER_KEY = Buffer.alloc(32, 9).toString("base64")

const withKey = (key?: string) => {
    if (key === undefined) {
        delete process.env.SECRETS_ENCRYPTION_KEY
    } else {
        process.env.SECRETS_ENCRYPTION_KEY = key
    }
    resetSecretEncryptionKeyCache()
}

const originalKey = process.env.SECRETS_ENCRYPTION_KEY

beforeEach(() => withKey(KEY))
afterEach(() => withKey(originalKey))

describe("encryptSecret", () => {
    it("given a key, when a value is encrypted, then the plaintext is nowhere in the result", () => {
        const encrypted = encryptSecret("wJalrXUtnFEMI-EXAMPLE-KEY", "Storage:authConfig.secretAccessKey")

        expect(encrypted).not.toContain("wJalrXUtnFEMI")
        expect(isEncryptedSecret(encrypted)).toBe(true)
    })

    it("given the same value twice, when it is encrypted, then the two results differ", () => {
        const context = "Storage:authConfig.secretAccessKey"

        expect(encryptSecret("same", context)).not.toBe(encryptSecret("same", context))
    })

    it("given an already encrypted value, when it is encrypted again, then it is returned untouched", () => {
        const encrypted = encryptSecret("a-token", "CodeRepository:accessToken")

        expect(encryptSecret(encrypted, "CodeRepository:accessToken")).toBe(encrypted)
    })

    it.each([
        ["an empty string", ""],
        ["undefined", undefined],
        ["a number", 42]
    ])("given %s, when it is encrypted, then it is returned untouched", (_label, value) => {
        expect(encryptSecret(value, "Storage:authConfig.jsonKey")).toBe(value)
    })

    it("given no key configured, when a value is encrypted, then it stays in the clear", () => {
        withKey(undefined)

        expect(isSecretEncryptionEnabled()).toBe(false)
        expect(encryptSecret("a-token", "CodeRepository:accessToken")).toBe("a-token")
    })
})

describe("decryptSecret", () => {
    it("given a value encrypted with the same key and context, when it is decrypted, then the plaintext comes back", () => {
        const context = "Storage:authConfig.connectionString"

        expect(decryptSecret(encryptSecret("DefaultEndpointsProtocol=https", context), context)).toBe("DefaultEndpointsProtocol=https")
    })

    /** The compatibility path: everything written before a key existed carries no marker. */
    it("given a plaintext value from before the key, when it is decrypted, then it is returned untouched", () => {
        expect(decryptSecret("a-plaintext-token", "CodeRepository:accessToken")).toBe("a-plaintext-token")
    })

    it("given a value encrypted for another field, when it is decrypted in this one, then it is refused", () => {
        const encrypted = encryptSecret("a-token", "CodeRepository:accessToken")

        expect(() => decryptSecret(encrypted, "Storage:authConfig.secretAccessKey")).toThrow(SecretEncryptionError)
    })

    it("given another key, when a value is decrypted, then it is refused", () => {
        const encrypted = encryptSecret("a-token", "CodeRepository:accessToken")
        withKey(OTHER_KEY)

        expect(() => decryptSecret(encrypted, "CodeRepository:accessToken")).toThrow(SecretEncryptionError)
    })

    it("given the key is gone, when an encrypted value is read, then the failure is explicit instead of silent", () => {
        const encrypted = encryptSecret("a-token", "CodeRepository:accessToken")
        withKey(undefined)

        expect(() => decryptSecret(encrypted, "CodeRepository:accessToken")).toThrow(/SECRETS_ENCRYPTION_KEY is not set/)
    })
})

describe("the configured key", () => {
    it("given 32 bytes in hex, when the key is read, then it is accepted like the base64 form", () => {
        withKey(Buffer.alloc(32, 7).toString("hex"))

        expect(decryptSecret(encryptSecret("a-token", "CodeRepository:accessToken"), "CodeRepository:accessToken")).toBe("a-token")
    })

    it("given a key of the wrong length, when it is read, then it is rejected with what to run to make one", () => {
        withKey("too-short")

        expect(() => isSecretEncryptionEnabled()).toThrow(/openssl rand -base64 32/)
    })
})
