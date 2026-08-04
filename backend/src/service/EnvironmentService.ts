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
        return Environment.find({ projectId: projectIdObj }).sort({ order: 1, createdAt: 1 })
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
        if (environment.order === undefined || environment.order === null) {
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
            if (env.order === undefined || env.order === null) {
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

    /**
     * Persists a new ordering for the environments of a project.
     * The position of each id inside the array becomes the environment order.
     * @param projectId The project owning the environments
     * @param ids The environment ids, already sorted as they have to be displayed
     */
    async updateOrder(projectId: string, ids: (string | ObjectId)[]): Promise<IEnvironment[]> {
        await this.ensureAccessToProject(projectId)
        const projectIdObj = toObjectId(projectId)

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            throw new Error("Ids array is required")
        }

        const idsObj = ids.map(id => toObjectId(id))
        const uniqueIds = new Set(idsObj.map(id => id.toString()))
        if (uniqueIds.size !== idsObj.length) {
            throw new Error("Ids array cannot contain duplicates")
        }

        const environments = await Environment.find({ projectId: projectIdObj }).select("_id")
        const projectEnvironmentIds = new Set(environments.map(environment => environment._id.toString()))
        const notInProject = idsObj.find(id => !projectEnvironmentIds.has(id.toString()))
        if (notInProject) {
            throw new EntityNotFoundError(notInProject.toString())
        }

        await Environment.bulkWrite(
            idsObj.map((id, index) => ({
                updateOne: {
                    filter: { _id: id, projectId: projectIdObj },
                    update: { $set: { order: index } }
                }
            }))
        )

        return this.getByProjectId(projectId)
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
