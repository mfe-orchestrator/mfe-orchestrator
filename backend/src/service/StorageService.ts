import { ClientSession, DeleteResult, ObjectId, Schema, Types } from "mongoose"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import Storage, { IStorage, STORAGE_SECRET_KEYS } from "../models/StorageModel"
import { StorageDTO } from "../types/StorageDTO"
import { toObjectId } from "../utils/mongooseUtils"
import { runInTransaction } from "../utils/runInTransaction"
import { SECRET_PLACEHOLDER } from "../utils/secretCrypto"
import BaseAuthorizedService from "./BaseAuthorizedService"

/**
 * The incoming authConfig with every credential the caller did not retype taken from the stored one.
 *
 * The edit form submits all of its fields, and the ones it never disclosed come back as the
 * placeholder the API sent; without this they would be saved literally and the storage would stop
 * authenticating. `existing` is undefined on a create, where a placeholder is nothing but a missing
 * value and the schema validator is left to reject it.
 */
export const withUnchangedSecrets = (incoming: StorageDTO, existing?: IStorage): StorageDTO => {
    const authConfig = { ...(incoming.authConfig as Record<string, unknown>) }
    const stored = existing?.authConfig as Record<string, unknown> | undefined

    for (const key of STORAGE_SECRET_KEYS) {
        if (authConfig[key] === SECRET_PLACEHOLDER) {
            authConfig[key] = stored?.[key]
        }
    }

    return { ...incoming, authConfig } as StorageDTO
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

        return await Storage.deleteOne({ _id: toObjectId(storageId) })
    }

    async makeDefault(storageId: string | Schema.Types.ObjectId): Promise<IStorage> {
        const storageIdObj = toObjectId(storageId)
        const storage = await this.getById(storageIdObj)

        if (storage.default) return storage

        storage.default = true
        await storage.save()

        await Storage.updateMany({ _id: { $ne: storageIdObj }, projectId: storage.projectId }, { default: false })

        return storage
    }
}
