import { describe, expect, it } from "vitest"
import { SECRET_PLACEHOLDER } from "../utils/secretCrypto"
import Storage, { StorageType } from "./StorageModel"

const awsStorage = () =>
    new Storage({
        name: "assets",
        type: StorageType.AWS,
        projectId: "68a0000000000000000000aa",
        authConfig: {
            bucketName: "assets-bucket",
            region: "eu-south-1",
            accessKeyId: "AKIAIOSFODNN7EXAMPLE",
            secretAccessKey: "wJalrXUtnFEMI-EXAMPLE-KEY"
        }
    })

describe("toFrontendObject", () => {
    it("given a storage with credentials, when it is sent to the console, then the secret is replaced by the placeholder", () => {
        const object = awsStorage().toFrontendObject()

        expect((object.authConfig as Record<string, unknown>).secretAccessKey).toBe(SECRET_PLACEHOLDER)
    })

    /**
     * What names the resource has to survive: the list screen shows the bucket, and the edit form has
     * to come back filled in for everything the user is expected to recognise.
     */
    it("given a storage with credentials, when it is sent to the console, then what addresses the bucket is kept", () => {
        const authConfig = awsStorage().toFrontendObject().authConfig as Record<string, unknown>

        expect(authConfig.bucketName).toBe("assets-bucket")
        expect(authConfig.region).toBe("eu-south-1")
        expect(authConfig.accessKeyId).toBe("AKIAIOSFODNN7EXAMPLE")
    })

    it("given a storage without a given credential, when it is sent to the console, then no placeholder is invented for it", () => {
        const authConfig = awsStorage().toFrontendObject().authConfig as Record<string, unknown>

        expect(authConfig.connectionString).toBeUndefined()
    })
})
