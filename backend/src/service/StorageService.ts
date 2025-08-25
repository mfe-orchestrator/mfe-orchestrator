import { ClientSession, DeleteResult, ObjectId } from "mongoose"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import Storage, { IStorage } from "../models/StorageModel"
import BaseAuthorizedService from "./BaseAuthorizedService"
import { runInTransaction } from "../utils/runInTransaction"
import { StorageDTO } from "../types/StorageDTO"

export class StorageService extends BaseAuthorizedService {
    async getByProjectId(projectId: string | ObjectId): Promise<IStorage[]> {
        await this.ensureAccessToProject(projectId)
        return Storage.find({ projectId })
    }

    async createRaw(projectId: string, storageData: StorageDTO, session?: ClientSession): Promise<IStorage> {
        await this.ensureAccessToProject(projectId, session)

        const storage = new Storage({
            ...storageData,
            projectId
        })

        return await storage.save({ session })
    }

    async create(projectId: string, storageData: StorageDTO): Promise<IStorage> {
        return runInTransaction(async session => this.createRaw(projectId, storageData, session))
    }

    async updateRaw(projectId: string, storageId: string, storageData: StorageDTO, session?: ClientSession): Promise<IStorage> {
        await this.ensureAccessToProject(projectId, session)

        const updated = await Storage.findByIdAndUpdate(storageId, storageData, { new: true, runValidators: true })
            .session(session || null)
            .lean()

        if (!updated) {
            throw new EntityNotFoundError(storageId)
        }

        return updated
    }

    async update(projectId: string, storageId: string, storageData: StorageDTO): Promise<IStorage> {
        return runInTransaction(async session => this.updateRaw(projectId, storageId, storageData, session))
    }

    async delete(storageId: string): Promise<DeleteResult> {
        const storage = await Storage.findById(storageId)

        if (!storage) {
            throw new EntityNotFoundError(storageId)
        }

        await this.ensureAccessToProject(storage.projectId)

        return await Storage.deleteOne({ _id: storageId })
    }
}
