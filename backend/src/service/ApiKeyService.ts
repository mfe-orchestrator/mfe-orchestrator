import { ClientSession, DeleteResult } from "mongoose"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import ApiKey, { ApiKeyRole, ApiKeyStatus, IApiKey, IApiKeyDocument } from "../models/ApiKeyModel"
import { ApiKeyDTO } from "../types/ApiKeyDTO"
import { invalidateApiKeyCredential } from "../utils/apiKeyCredentialCache"
import { toObjectId } from "../utils/mongooseUtils"
import { runInTransaction } from "../utils/runInTransaction"
import BaseAuthorizedService from "./BaseAuthorizedService"

const insertApiKey = async (projectId: string, apiKeyData: ApiKeyDTO, session?: ClientSession): Promise<IApiKey> => {
    const projectIdObj = toObjectId(projectId)

    const apiKeyRawData: IApiKey = {
        ...apiKeyData,
        status: ApiKeyStatus.ACTIVE,
        role: apiKeyData.role || ApiKeyRole.MANAGER,
        apiKey: crypto.randomUUID(),
        projectId: projectIdObj
    }

    await new ApiKey(apiKeyRawData).save({ session })
    return apiKeyRawData
}

/**
 * The deploy key of a repository the console creates for a microfrontend or a service, minted as a system
 * action: a function of the module rather than a method of the service, so that no endpoint reaches it with
 * a principal. Nothing about the principal is checked here, the callers checked the access to the project
 * and to the domain of the component before creating anything at the provider.
 *
 * A deliberate product choice: a member assigned to some domains only may create the repository of a
 * component of theirs, and its CI then receives a MANAGER key valid on the whole project. Refusing the
 * key would leave the repository just created at the provider without the secret its pipeline needs.
 * The key endpoints themselves (createRaw and the rest) stay reserved to whoever reaches the whole project.
 */
export const createSystemDeployKey = (projectId: string, apiKeyData: ApiKeyDTO): Promise<IApiKey> => insertApiKey(projectId, apiKeyData)

export class ApiKeyService extends BaseAuthorizedService {
    async getByProjectId(projectId: string): Promise<IApiKeyDocument[]> {
        await this.ensureAccessToProject(projectId)
        return await ApiKey.find({ projectId: toObjectId(projectId) })
    }

    async createRaw(projectId: string, apiKeyData: ApiKeyDTO, session?: ClientSession): Promise<IApiKey> {
        await this.ensureAccessToProject(projectId, session)
        // A key acts on the whole project: handing one out is not for a member of some domains only
        await this.ensureWholeProject(projectId)
        return insertApiKey(projectId, apiKeyData, session)
    }

    async create(projectId: string, apiKeyData: ApiKeyDTO): Promise<IApiKey> {
        return runInTransaction(async session => this.createRaw(projectId, apiKeyData, session))
    }

    async setStatusRaw(apiKeyId: string, status: ApiKeyStatus, session?: ClientSession) {
        // Options third: as the second argument the session was read as a projection, and revoking failed
        const apiKey = await ApiKey.findById(apiKeyId, null, { session })
        if (!apiKey) {
            throw new EntityNotFoundError(apiKeyId)
        }

        await this.ensureAccessToProject(apiKey.projectId, session)
        await this.ensureWholeProject(apiKey.projectId)

        const updated = await ApiKey.findByIdAndUpdate(apiKeyId, { status }, { new: true, runValidators: true }).session(session || null)

        if (!updated) {
            throw new EntityNotFoundError(apiKeyId)
        }

        // The MCP endpoint remembers valid keys for up to a minute: a revoked one must not linger there
        await invalidateApiKeyCredential(apiKeyId)

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
        await this.ensureWholeProject(apiKey.projectId)
        const result = await ApiKey.deleteOne({ _id: apiKeyObjectId })
        await invalidateApiKeyCredential(apiKeyId)
        return result
    }
}
