import { ClientSession, ObjectId, Schema, Types } from "mongoose"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import Environment, { IEnvironment } from "../models/EnvironmentModel"
import GlobalVariable from "../models/GlobalVariableModel"
import Microfrontend from "../models/MicrofrontendModel"
import { EnvironmentDTO } from "../types/EnvironmentDTO"
import { toObjectId } from "../utils/mongooseUtils"
import { runInTransaction } from "../utils/runInTransaction"
import BaseAuthorizedService from "./BaseAuthorizedService"

class EnvironmentService extends BaseAuthorizedService {
    async getByProjectId(projectId: string) {
        await this.ensureAccessToProject(projectId)
        const projectIdObj = toObjectId(projectId)
        return Environment.find({ projectId: projectIdObj }).sort({ order: 1 })
    }

    async getById(id: string | Schema.Types.ObjectId, session?: ClientSession) {
        await this.ensureAccessToEnvironment(id, session)
        return await Environment.findOne({ _id: toObjectId(id) }).session(session ?? null)
    }

    async getMaxOrderByProjectId(projectId: Schema.Types.ObjectId): Promise<number> {
        return (await Environment.findOne({ projectId: toObjectId(projectId) }).sort({ order: -1 }))?.order ?? 0
    }

    async create(environmentData: EnvironmentDTO, projectId: string): Promise<IEnvironment> {
        const projectIdObj = toObjectId(projectId)
        await this.ensureAccessToProject(projectIdObj)
        const environment = new Environment(environmentData)
        environment.projectId = projectIdObj
        if (!environment.order) {
            environment.order = (await this.getMaxOrderByProjectId(projectIdObj)) + 1
        }
        return await environment.save()
    }

    async createBulk(body: EnvironmentDTO[], projectId: string) {
        const projectIdObj = toObjectId(projectId)
        await this.ensureAccessToProject(projectIdObj)
        const environments = body.map(env => new Environment(env))
        let maxOrder = (await this.getMaxOrderByProjectId(projectIdObj)) + 1
        environments.forEach(env => {
            env.projectId = projectIdObj
            if (!env.order) {
                env.order = maxOrder
                maxOrder++
            }
        })
        return await Environment.insertMany(environments)
    }

    async update(environmentId: string | ObjectId, updateData: EnvironmentDTO) {
        await this.ensureAccessToEnvironment(environmentId)
        const environmentIdObj = toObjectId(environmentId)
        const updatedEnvironment = await Environment.findOneAndUpdate({ _id: environmentIdObj }, updateData, { new: true })

        if (!updatedEnvironment) {
            throw new EntityNotFoundError(environmentIdObj.toString())
        }

        return updatedEnvironment
    }

    async deleteSingle(environmentId: string | ObjectId) {
        await this.ensureAccessToEnvironment(environmentId)
        const environmentIdObj = toObjectId(environmentId)
        const deletedEnvironment = await Environment.findOneAndDelete({ _id: environmentIdObj })
        if (!deletedEnvironment) {
            throw new EntityNotFoundError(environmentIdObj.toString())
        }
    }

    // Delete multiple environments
    async deleteMultiple(ids: (string | ObjectId)[]) {
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            throw new Error("Ids array is required")
        }

        const idsObj = await Promise.all(
            ids.map(async id => {
                await this.ensureAccessToEnvironment(id)
                return toObjectId(id)
            })
        )

        return await Environment.deleteMany({ _id: { $in: idsObj } })
    }
}

export default EnvironmentService
