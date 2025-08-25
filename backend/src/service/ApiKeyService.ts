import { ClientSession, DeleteResult } from "mongoose"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import ApiKey, { ApiKeyStatus, IApiKey, IApiKeyDocument } from "../models/ApiKeyModel"
import { runInTransaction } from "../utils/runInTransaction"
import BaseAuthorizedService from "./BaseAuthorizedService"
import { ApiKeyDTO } from "../types/ApiKeyDTO"
import { v4 as uuidv4 } from "uuid"

export class ApiKeyService extends BaseAuthorizedService {
    async getByProjectId(projectId: string): Promise<IApiKeyDocument[]> {
        await this.ensureAccessToProject(projectId)
        return await ApiKey.find({ projectId })
    }

    async createRaw(projectId: string, apiKeyData: ApiKeyDTO, session?: ClientSession): Promise<IApiKey> {
        await this.ensureAccessToProject(projectId, session)

        const apiKey = new ApiKey({
            ...apiKeyData,
            apiKey: uuidv4(),
            projectId
        })

        await apiKey.save({ session })
        return apiKey
    }

    async create(projectId: string, apiKeyData: ApiKeyDTO): Promise<IApiKey> {
        return runInTransaction(async session => this.createRaw(projectId, apiKeyData, session))
    }

    async setStatusRaw(apiKeyId: string, status: ApiKeyStatus, session?: ClientSession) {
        const apiKey = await ApiKey.findById(apiKeyId)
        if (!apiKey) {
            throw new EntityNotFoundError(apiKeyId)
        }

        await this.ensureAccessToProject(apiKey.projectId, session)

        const updated = await ApiKey.findByIdAndUpdate(apiKeyId, { status }, { new: true, runValidators: true })
            .session(session || null)
            .lean()

        if (!updated) {
            throw new EntityNotFoundError(apiKeyId)
        }

        return updated
    }

    async setStatus(apiKeyId: string, status: ApiKeyStatus): Promise<IApiKey> {
        return runInTransaction(async session => this.setStatusRaw(apiKeyId, status, session))
    }

    async delete(apiKeyId: string): Promise<DeleteResult> {
        const apiKey = await ApiKey.findById(apiKeyId)
        if (!apiKey) {
            throw new EntityNotFoundError(apiKeyId)
        }

        await this.ensureAccessToProject(apiKey.projectId)
        return await ApiKey.deleteOne({ _id: apiKeyId })
    }
}
