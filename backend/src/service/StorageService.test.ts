import { describe, expect, it } from "vitest"
import { IStorage, StorageType } from "../models/StorageModel"
import { StorageDTO } from "../types/StorageDTO"
import { SECRET_PLACEHOLDER } from "../utils/secretCrypto"
import { withUnchangedSecrets } from "./StorageService"

const incoming = (secretAccessKey: string): StorageDTO =>
    ({
        name: "assets",
        type: StorageType.AWS,
        authConfig: { bucketName: "assets-bucket", region: "eu-south-1", accessKeyId: "AKIA-EXAMPLE", secretAccessKey }
    }) as StorageDTO

const stored = { authConfig: { secretAccessKey: "the-real-key" } } as unknown as IStorage

const secretOf = (dto: StorageDTO) => (dto.authConfig as Record<string, unknown>).secretAccessKey

describe("withUnchangedSecrets", () => {
    /** The form submits every field, including the one it only ever received as bullets. */
    it("given the placeholder came back, when the storage is updated, then the stored credential is kept", () => {
        expect(secretOf(withUnchangedSecrets(incoming(SECRET_PLACEHOLDER), stored))).toBe("the-real-key")
    })

    it("given a retyped credential, when the storage is updated, then it replaces the stored one", () => {
        expect(secretOf(withUnchangedSecrets(incoming("a-new-key"), stored))).toBe("a-new-key")
    })

    it("given no storage to take it from, when the placeholder is submitted, then nothing stands in for the credential", () => {
        expect(secretOf(withUnchangedSecrets(incoming(SECRET_PLACEHOLDER)))).toBeUndefined()
    })

    it("given a credential is merged, when the result is built, then the rest of the configuration is untouched", () => {
        const authConfig = withUnchangedSecrets(incoming(SECRET_PLACEHOLDER), stored).authConfig as Record<string, unknown>

        expect(authConfig.bucketName).toBe("assets-bucket")
        expect(authConfig.accessKeyId).toBe("AKIA-EXAMPLE")
    })
})
