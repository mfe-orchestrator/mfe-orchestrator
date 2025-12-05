import { ClientSession, DeleteResult, Types } from "mongoose"
import { v4 as uuidv4 } from "uuid"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import ApiKey, { ApiKeyRole, ApiKeyStatus, IApiKey, IApiKeyDocument } from "../models/ApiKeyModel"
import { ApiKeyDTO } from "../types/ApiKeyDTO"
import { toObjectId } from "../utils/mongooseUtils"
import { runInTransaction } from "../utils/runInTransaction"
import BaseAuthorizedService from "./BaseAuthorizedService"

export class ApiKeyService extends BaseAuthorizedService {
    async getByProjectId(projectId: string): Promise<IApiKeyDocument[]> {
        await this.ensureAccessToProject(projectId)
        return await ApiKey.find({ projectId: toObjectId(projectId) })
    }

    async createRaw(projectId: string, apiKeyData: ApiKeyDTO, session?: ClientSession): Promise<IApiKey> {
        await this.ensureAccessToProject(projectId, session)
        const projectIdObj = toObjectId(projectId)

        const apiKeyRawData: IApiKey = {
            ...apiKeyData,
            status: ApiKeyStatus.ACTIVE,
            role: apiKeyData.role || ApiKeyRole.MANAGER,
            apiKey: uuidv4(),
            projectId: projectIdObj
        }

        await new ApiKey(apiKeyRawData).save({ session })
        return apiKeyRawData
    }

    async create(projectId: string, apiKeyData: ApiKeyDTO): Promise<IApiKey> {
        return runInTransaction(async session => this.createRaw(projectId, apiKeyData, session))
    }

    async setStatusRaw(apiKeyId: string, status: ApiKeyStatus, session?: ClientSession) {
        const apiKey = await ApiKey.findById(apiKeyId, { session })
        if (!apiKey) {
            throw new EntityNotFoundError(apiKeyId)
        }

        await this.ensureAccessToProject(apiKey.projectId, session)

        const updated = await ApiKey.findByIdAndUpdate(apiKeyId, { status }, { new: true, runValidators: true }).session(session || null)

        if (!updated) {
            throw new EntityNotFoundError(apiKeyId)
        }

        return updated
    }

    async setStatus(apiKeyId: string, status: ApiKeyStatus): Promise<IApiKey> {
        return runInTransaction(async session => this.setStatusRaw(apiKeyId, status, session))
    }

    async delete(apiKeyId: string): Promise<DeleteResult> {
        const apiKeyObjectId = toObjectId(apiKeyId)
        const apiKey = await ApiKey.findById(apiKeyObjectId)
        if (!apiKey) {
            throw new EntityNotFoundError(apiKeyId)
        }

        await this.ensureAccessToProject(apiKey.projectId)
        return await ApiKey.deleteOne({ _id: apiKeyObjectId })
    }
}
