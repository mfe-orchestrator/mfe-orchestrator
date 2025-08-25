import { ObjectId, Types } from "mongoose"
import Storage, { IStorage } from "../models/StorageModel"
import BaseAuthorizedService from "./BaseAuthorizedService"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import { BusinessException, createBusinessException } from "../errors/BusinessException"

export class StorageService extends BaseAuthorizedService {
    async getByProjectId(projectId: string | ObjectId): Promise<IStorage[]> {
        await this.ensureAccessToProject(projectId)
        return Storage.find({ projectId })
    }

    async delete(storageId: string): Promise<boolean> {
        const storage = await Storage.findById(storageId)

        if (!storage) {
            throw new EntityNotFoundError(storageId)
        }

        await this.ensureAccessToProject(storage.projectId)

        try {
            if (!Types.ObjectId.isValid(storageId)) {
                throw createBusinessException({
                    code: "INVALID_ID",
                    message: "Invalid storage ID format",
                    statusCode: 400
                })
            }

            const result = await Storage.deleteOne({ _id: storageId })

            if (result.deletedCount === 0) {
                throw createBusinessException({
                    code: "STORAGE_NOT_FOUND",
                    message: "Storage not found",
                    statusCode: 404
                })
            }

            return true
        } catch (error) {
            if (error instanceof BusinessException) throw error

            throw createBusinessException({
                code: "STORAGE_DELETION_ERROR",
                message: "Failed to delete storage",
                details: { error: error instanceof Error ? error.message : "Unknown error" },
                statusCode: 500
            })
        }
    }
}
