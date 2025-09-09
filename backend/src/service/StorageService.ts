import { ClientSession, DeleteResult, ObjectId } from "mongoose"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import Storage, { IStorage } from "../models/StorageModel"
import BaseAuthorizedService from "./BaseAuthorizedService"
import { runInTransaction } from "../utils/runInTransaction"
import { StorageDTO } from "../types/StorageDTO"
import { Types } from "mongoose"

export class StorageService extends BaseAuthorizedService {
    async getByProjectId(projectId: string | ObjectId): Promise<IStorage[]> {
        await this.ensureAccessToProject(projectId)
        return Storage.find({ projectId })
    }

    async getById(storageId : string | ObjectId): Promise<IStorage> {
        return runInTransaction(async session => this.getByIdRaw(storageId, session))
    }

    async getByIdRaw(storageId : string | ObjectId, session?: ClientSession) : Promise<IStorage> {
        const storagetIdObj = typeof storageId === "string" ? new Types.ObjectId(storageId) : storageId
        const storage = await Storage.findById(storagetIdObj, { }, { session })
        if(!storage){
            throw new EntityNotFoundError(storagetIdObj + "")
        }
        await this.ensureAccessToProject(storage.projectId, session)

        return storage;
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

    async updateRaw(storageId: string, storageData: StorageDTO, session?: ClientSession): Promise<IStorage> {
        const storage = await this.getByIdRaw(storageId, session)

        const updated = await Storage.findByIdAndUpdate(storage._id, {...storageData, projectId: storage.projectId}, { new: true, runValidators: true, context: 'query' })
            .session(session || null)
            .lean()

        if (!updated) {
            throw new EntityNotFoundError(storageId)
        }

        return updated
    }

    async update(storageId: string, storageData: StorageDTO): Promise<IStorage> {
        return runInTransaction(async session => this.updateRaw(storageId, storageData, session))
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
