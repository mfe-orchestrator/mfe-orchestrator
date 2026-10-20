import { ClientSession, DeleteResult, ObjectId, Schema, Types } from "mongoose"
import path from "path"
import { Readable } from "stream"
import { finished } from "stream/promises"
import AzureStorageClient from "../client/AzureStorageAccount"
import GoogleStorageClient from "../client/GoogleStorageAccount"
import S3BucketClient from "../client/S3Buckets"
import { createBusinessException } from "../errors/BusinessException"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import Project from "../models/ProjectModel"
import Storage, { IStorage, STORAGE_SECRET_KEYS, StorageType } from "../models/StorageModel"
import { StorageDTO } from "../types/StorageDTO"
import { ConnectionTestResultDTO, runConnectionTest, withTimeout } from "../utils/connectionTest"
import { toObjectId } from "../utils/mongooseUtils"
import { runInTransaction } from "../utils/runInTransaction"
import { SECRET_PLACEHOLDER } from "../utils/secretCrypto"
import BaseAuthorizedService from "./BaseAuthorizedService"

/** Who a stored credential belongs to: the key id of AWS, the account and identity of Azure, the key itself for Google */
const identityOf = (storage: Pick<StorageDTO, "type" | "authConfig">): string => {
    const config = (storage.authConfig ?? {}) as Record<string, unknown>
    switch (storage.type) {
        case StorageType.AWS:
            return JSON.stringify([config.accessKeyId])
        case StorageType.AZURE:
            return JSON.stringify([config.authType, config.accountName, config.tenantId, config.clientId])
        default:
            return JSON.stringify([config.authType])
    }
}

/**
 * The incoming authConfig with every credential the caller did not retype taken from the stored one.
 *
 * The edit form submits all of its fields, and the ones it never disclosed come back as the
 * placeholder the API sent; without this they would be saved literally and the storage would stop
 * authenticating. A credential is lent only to the type and the identity it was saved with: changing
 * them, or a create (`existing` undefined), means typing it.
 */
export const withUnchangedSecrets = (incoming: StorageDTO, existing?: IStorage): StorageDTO => {
    const authConfig = { ...(incoming.authConfig as Record<string, unknown>) }
    const lendable = existing && existing.type === incoming.type && identityOf(existing) === identityOf(incoming) ? (existing.authConfig as unknown as Record<string, unknown>) : undefined

    for (const key of STORAGE_SECRET_KEYS) {
        if (authConfig[key] === SECRET_PLACEHOLDER) {
            if (!lendable?.[key]) {
                throw createBusinessException({
                    code: "STORAGE_SECRET_REQUIRED",
                    message: `Type the ${key} again: a stored one is kept only while the type and the account stay the same`
                })
            }
            authConfig[key] = lendable[key]
        }
    }

    return { ...incoming, authConfig } as StorageDTO
}

const WRITE_FORBIDDEN = { code: "STORAGE_WRITE_FORBIDDEN", message: "A viewer of the project cannot add, edit, test or delete a storage" }

/** The probe goes where the bundles of the project go, keyed the way ServeService reads them */
export const PROBE_FILE = ".mfe-orchestrator-connection-test"

type StorageClient = Pick<S3BucketClient, "uploadFile" | "deleteFile"> & { downloadFileStream(filePath: string): Readable | Promise<Readable> }

const S3_BUCKET = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/
const S3_REGION = /^[a-z]{2}(-[a-z]+)+-\d+$/
const GCS_BUCKET = /^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/
/** Azure Blob in the public cloud and in the sovereign ones; an account name is 3 to 24 lowercase letters and digits */
const AZURE_BLOB_HOST = /^[a-z0-9]{3,24}\.blob\.core\.(windows\.net|chinacloudapi\.cn|usgovcloudapi\.net)$/

/**
 * The client of a storage, refused unless it would talk to the provider: a test sends requests from the
 * server and reports what came back, so an address of the network the server sits in must not be one.
 * Azure is checked on the endpoint the client resolved, since a BlobEndpoint or an EndpointSuffix in the
 * connection string, or an account name with a slash in it, all move it.
 */
export const clientOf = (storage: StorageDTO): StorageClient => {
    switch (storage.type) {
        case StorageType.AWS:
            if (!S3_BUCKET.test(storage.authConfig.bucketName ?? "")) throw new Error("The bucket name is not a valid S3 bucket name")
            if (!S3_REGION.test(storage.authConfig.region ?? "")) throw new Error("The region is not an AWS region, like eu-south-1")
            return new S3BucketClient(storage.authConfig)
        case StorageType.AZURE: {
            const client = new AzureStorageClient(storage.authConfig)
            const endpoint = new URL(client.endpoint)
            if (endpoint.protocol !== "https:" || !AZURE_BLOB_HOST.test(endpoint.hostname)) {
                throw new Error("The storage does not point to an Azure Blob Storage account over HTTPS (<account>.blob.core.windows.net)")
            }
            return client
        }
        case StorageType.GOOGLE:
            if (!GCS_BUCKET.test(storage.authConfig.bucketName ?? "")) throw new Error("The bucket name is not a valid Google Cloud Storage bucket name")
            // JSON.parse quotes the start of what it could not read, and here that is the private key
            try {
                JSON.parse(storage.authConfig.jsonKey)
            } catch {
                throw new Error("The service account key is not valid JSON")
            }
            return new GoogleStorageClient(storage.authConfig)
        default:
            throw createBusinessException({ code: "STORAGE_TYPE_INVALID", message: `type must be one of ${Object.values(StorageType).join(", ")}` })
    }
}

/**
 * What the hosting needs of a storage, in the order it needs it: a bundle uploaded, then served back.
 * The probe is deleted afterwards when the credentials allow it; the hosting never needs them to.
 */
export const probeStorage = async (storage: StorageDTO & { path?: string }, projectFolder: string): Promise<void> => {
    let key = path.join(storage.path || "", projectFolder, PROBE_FILE)
    if (key.startsWith("/")) {
        key = key.substring(1)
    }

    const client = clientOf(storage)
    await client.uploadFile(key, "ok", "text/plain")
    // Read to the end: a denied read can fail after the response headers, not before
    await finished((await client.downloadFileStream(key)).resume())
    await client.deleteFile(key).catch(() => undefined)
}

export class StorageService extends BaseAuthorizedService {
    async getByProjectId(projectId: string | Schema.Types.ObjectId): Promise<IStorage[]> {
        await this.ensureAccessToProject(projectId)
        return Storage.find({ projectId: toObjectId(projectId) })
    }

    async getById(storageId: string | ObjectId): Promise<IStorage> {
        return runInTransaction(async session => this.getByIdRaw(storageId, session))
    }

    async getByIdRaw(storageId: string | ObjectId, session?: ClientSession): Promise<IStorage> {
        const storagetIdObj = typeof storageId === "string" ? new Types.ObjectId(storageId) : storageId
        const storage = await Storage.findById(storagetIdObj, {}, { session })
        if (!storage) {
            throw new EntityNotFoundError(storagetIdObj + "")
        }
        await this.ensureAccessToProject(storage.projectId, session)

        return storage
    }

    async createRaw(projectId: string, storageData: StorageDTO, session?: ClientSession): Promise<IStorage> {
        await this.ensureAccessToProject(projectId, session)
        await this.ensureNotViewer(projectId, WRITE_FORBIDDEN)
        // Every microfrontend of the project may be served from a storage: they are no domain's own
        await this.ensureWholeProject(projectId)

        const storage = new Storage({
            ...withUnchangedSecrets(storageData),
            projectId
        })

        return await storage.save({ session })
    }

    async create(projectId: string, storageData: StorageDTO): Promise<IStorage> {
        return runInTransaction(async session => this.createRaw(projectId, storageData, session))
    }

    async updateRaw(storageId: string, storageData: StorageDTO, session?: ClientSession): Promise<IStorage> {
        const storage = await this.getByIdRaw(storageId, session)
        await this.ensureNotViewer(storage.projectId, WRITE_FORBIDDEN)
        await this.ensureWholeProject(storage.projectId)

        const updated = await Storage.findByIdAndUpdate(
            storage._id,
            { ...withUnchangedSecrets(storageData, storage), projectId: storage.projectId },
            { new: true, runValidators: true, context: "query" }
        ).session(session || null)

        if (!updated) {
            throw new EntityNotFoundError(storageId)
        }

        return updated
    }

    async update(storageId: string, storageData: StorageDTO): Promise<IStorage> {
        return runInTransaction(async session => this.updateRaw(storageId, storageData, session))
    }

    async delete(storageId: string | Schema.Types.ObjectId): Promise<DeleteResult> {
        const storage = await Storage.findById(storageId)

        if (!storage) {
            throw new EntityNotFoundError(storageId.toString())
        }

        await this.ensureAccessToProject(storage.projectId)
        await this.ensureNotViewer(storage.projectId, WRITE_FORBIDDEN)
        await this.ensureWholeProject(storage.projectId)

        return await Storage.deleteOne({ _id: toObjectId(storageId) })
    }

    async makeDefault(storageId: string | Schema.Types.ObjectId): Promise<IStorage> {
        const storageIdObj = toObjectId(storageId)
        const storage = await this.getById(storageIdObj)
        await this.ensureNotViewer(storage.projectId, WRITE_FORBIDDEN)
        await this.ensureWholeProject(storage.projectId)

        if (storage.default) return storage

        storage.default = true
        await storage.save()

        await Storage.updateMany({ _id: { $ne: storageIdObj }, projectId: storage.projectId }, { default: false })

        return storage
    }

    /**
     * Probes the storage the form describes, without saving it. On an edit the form still carries the
     * placeholder for the credentials it never received: they are taken from the storage named in
     * `scope`, as long as the type is the same.
     */
    async testConnection(dto: StorageDTO, scope: { projectId: string } | { storageId: string }): Promise<ConnectionTestResultDTO> {
        const stored = "storageId" in scope ? await this.getById(scope.storageId) : undefined
        const projectId = stored?.projectId ?? (scope as { projectId: string }).projectId
        if (!stored) await this.ensureAccessToProject(projectId)
        await this.ensureNotViewer(projectId, WRITE_FORBIDDEN)
        // Probes with the stored credentials of a storage of the project, as an update would
        await this.ensureWholeProject(projectId)

        const project = await Project.findById(projectId, { slug: 1 })
        if (!project) {
            throw new EntityNotFoundError(String(projectId))
        }

        const storage = withUnchangedSecrets(dto, stored)
        const secrets = STORAGE_SECRET_KEYS.map(key => (storage.authConfig as Record<string, unknown>)[key])
        // The folder ServeService reads the bundles of the project from: credentials scoped to it pass
        const projectFolder = `${project.slug}-${project._id.toString()}`
        return runConnectionTest(() => withTimeout(probeStorage(storage, projectFolder), 30_000, "The storage test"), secrets)
    }
}
