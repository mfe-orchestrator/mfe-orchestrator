import { Readable } from "stream"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { BusinessException } from "../errors/BusinessException"
import { IStorage, StorageType } from "../models/StorageModel"
import { StorageDTO } from "../types/StorageDTO"
import { SECRET_PLACEHOLDER } from "../utils/secretCrypto"
import { clientOf, PROBE_FILE, probeStorage, withUnchangedSecrets } from "./StorageService"

const s3 = vi.hoisted(() => ({ uploadFile: vi.fn(), downloadFileStream: vi.fn(), deleteFile: vi.fn() }))

vi.mock("../client/S3Buckets", () => ({
    default: vi.fn(function () {
        return s3
    })
}))

const incoming = (secretAccessKey: string): StorageDTO =>
    ({
        name: "assets",
        type: StorageType.AWS,
        authConfig: { bucketName: "assets-bucket", region: "eu-south-1", accessKeyId: "AKIA-EXAMPLE", secretAccessKey }
    }) as StorageDTO

const stored = { type: StorageType.AWS, authConfig: { accessKeyId: "AKIA-EXAMPLE", secretAccessKey: "the-real-key" } } as unknown as IStorage

const codeOf = (run: () => unknown): string | undefined => {
    try {
        run()
    } catch (error) {
        return (error as BusinessException).code
    }
}

const secretOf = (dto: StorageDTO) => (dto.authConfig as Record<string, unknown>).secretAccessKey

describe("withUnchangedSecrets", () => {
    /** The form submits every field, including the one it only ever received as bullets. */
    it("given the placeholder came back, when the storage is updated, then the stored credential is kept", () => {
        expect(secretOf(withUnchangedSecrets(incoming(SECRET_PLACEHOLDER), stored))).toBe("the-real-key")
    })

    it("given a retyped credential, when the storage is updated, then it replaces the stored one", () => {
        expect(secretOf(withUnchangedSecrets(incoming("a-new-key"), stored))).toBe("a-new-key")
    })

    it("given no storage to take it from, when the placeholder is submitted, then the credential has to be typed", () => {
        expect(codeOf(() => withUnchangedSecrets(incoming(SECRET_PLACEHOLDER)))).toBe("STORAGE_SECRET_REQUIRED")
    })

    /** The secret key belongs to its key id: lent to another one, it would be sent to whoever owns that */
    it("given another access key id, when the placeholder is submitted, then the secret has to be typed again", () => {
        const otherKey = { ...incoming(SECRET_PLACEHOLDER), authConfig: { ...incoming(SECRET_PLACEHOLDER).authConfig, accessKeyId: "AKIA-OTHER" } } as StorageDTO

        expect(codeOf(() => withUnchangedSecrets(otherKey, stored))).toBe("STORAGE_SECRET_REQUIRED")
    })

    it("given another Azure account, when the placeholder is submitted, then the key has to be typed again", () => {
        const azure = (accountName: string, accountKey: string) =>
            ({ name: "a", type: StorageType.AZURE, authConfig: { authType: "sharedKey", accountName, accountKey, containerName: "bundles" } }) as StorageDTO
        const storedAzure = { ...azure("ours", "the-real-key") } as unknown as IStorage

        expect(codeOf(() => withUnchangedSecrets(azure("theirs", SECRET_PLACEHOLDER), storedAzure))).toBe("STORAGE_SECRET_REQUIRED")
        expect((withUnchangedSecrets(azure("ours", SECRET_PLACEHOLDER), storedAzure).authConfig as Record<string, unknown>).accountKey).toBe("the-real-key")
    })

    it("given another bucket on the same key, when the placeholder is submitted, then the stored secret is kept", () => {
        const otherBucket = { ...incoming(SECRET_PLACEHOLDER), authConfig: { ...incoming(SECRET_PLACEHOLDER).authConfig, bucketName: "other-bucket" } } as StorageDTO

        expect(secretOf(withUnchangedSecrets(otherBucket, stored))).toBe("the-real-key")
    })

    it("given a credential is merged, when the result is built, then the rest of the configuration is untouched", () => {
        const authConfig = withUnchangedSecrets(incoming(SECRET_PLACEHOLDER), stored).authConfig as Record<string, unknown>

        expect(authConfig.bucketName).toBe("assets-bucket")
        expect(authConfig.accessKeyId).toBe("AKIA-EXAMPLE")
    })
})

describe("probeStorage", () => {
    const storage = (path?: string) => ({ ...incoming("a-key"), path }) as StorageDTO & { path?: string }

    beforeEach(() => {
        vi.clearAllMocks()
        s3.uploadFile.mockResolvedValue("url")
        s3.downloadFileStream.mockImplementation(async () => Readable.from(["ok"]))
        s3.deleteFile.mockResolvedValue(undefined)
    })

    it("given a storage path, when the storage is probed, then the probe is written, read back and deleted under it", async () => {
        await probeStorage(storage("bundles"), "shop-68a0")

        expect(s3.uploadFile).toHaveBeenCalledWith(`bundles/shop-68a0/${PROBE_FILE}`, "ok", "text/plain")
        expect(s3.downloadFileStream).toHaveBeenCalledWith(`bundles/shop-68a0/${PROBE_FILE}`)
        expect(s3.deleteFile).toHaveBeenCalledWith(`bundles/shop-68a0/${PROBE_FILE}`)
    })

    /** ServeService strips it too: an object key does not start with a slash */
    it("given the root path, when the storage is probed, then the key has no leading slash", async () => {
        await probeStorage(storage("/"), "shop-68a0")

        expect(s3.uploadFile).toHaveBeenCalledWith(`shop-68a0/${PROBE_FILE}`, "ok", "text/plain")
    })

    it("given credentials that may not delete, when the storage is probed, then the probe still passes", async () => {
        s3.deleteFile.mockRejectedValue(new Error("Access Denied"))

        await expect(probeStorage(storage(), "shop-68a0")).resolves.toBeUndefined()
    })

    it("given credentials that may write but not read, when the storage is probed, then it fails", async () => {
        s3.downloadFileStream.mockRejectedValue(new Error("Failed to download file from S3: Access Denied"))

        await expect(probeStorage(storage(), "shop-68a0")).rejects.toThrow("Access Denied")
    })

    it("given a Google key that is not JSON, when the storage is probed, then the error does not quote it", async () => {
        const google = { name: "g", type: StorageType.GOOGLE, authConfig: { authType: "serviceAccount", jsonKey: "-----BEGIN PRIVATE KEY-----abc", bucketName: "bundles" } } as StorageDTO

        await expect(probeStorage(google, "shop-68a0")).rejects.toThrow("The service account key is not valid JSON")
    })
})

/** A test reports what came back from wherever it sent its requests: only the providers may be asked */
describe("clientOf", () => {
    const azure = (authConfig: Record<string, unknown>) => ({ name: "a", type: StorageType.AZURE, authConfig: { containerName: "bundles", ...authConfig } }) as StorageDTO

    it("given an Azure account, when its client is built, then it is accepted", () => {
        expect(() => clientOf(azure({ authType: "sharedKey", accountName: "ourbundles", accountKey: "a2V5" }))).not.toThrow()
    })

    it.each([
        ["an account name that moves the host", { authType: "sharedKey", accountName: "127.0.0.1:8080/x?", accountKey: "a2V5" }],
        [
            "a BlobEndpoint of the internal network",
            { authType: "connectionString", connectionString: "DefaultEndpointsProtocol=http;AccountName=x;AccountKey=a2V5;BlobEndpoint=http://10.0.0.5:8080/admin" }
        ],
        ["an EndpointSuffix of someone else", { authType: "connectionString", connectionString: "DefaultEndpointsProtocol=https;AccountName=ours;AccountKey=a2V5;EndpointSuffix=example.com" }]
    ])("given %s, when the Azure client is built, then it is refused", (_case, authConfig) => {
        expect(() => clientOf(azure(authConfig))).toThrow("Azure Blob Storage account")
    })

    it.each([
        ["a bucket with a slash", { bucketName: "a/../b", region: "eu-south-1" }],
        ["a region that is a host", { bucketName: "assets", region: "evil.example#" }]
    ])("given %s, when the S3 client is built, then it is refused", (_case, addressing) => {
        expect(() => clientOf({ ...incoming("a-key"), authConfig: { ...incoming("a-key").authConfig, ...addressing } } as StorageDTO)).toThrow()
    })
})
