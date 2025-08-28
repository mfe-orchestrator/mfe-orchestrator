import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import Deployment, { IDeployment } from "../models/DeploymentModel"
import Environment from "../models/EnvironmentModel"
import GlobalVariable from "../models/GlobalVariableModel"
import Microfrontend from "../models/MicrofrontendModel"
import BaseAuthorizedService from "./BaseAuthorizedService"
import { ClientSession, ObjectId } from "mongoose"
import { runInTransaction } from "../utils/runInTransaction"

class DeploymentService extends BaseAuthorizedService {
    async getByEnvironmentId(environmentId: string | ObjectId) {
        await this.ensureAccessToEnvironment(environmentId)
        return Deployment.find({ environmentId })
    }

    async createRaw(environmentId: string | ObjectId, session?: ClientSession) {
        await this.ensureAccessToEnvironment(environmentId, session)
        const environment = await Environment.findById(environmentId).session(session || null)
        if (!environment) {
            throw new EntityNotFoundError(environmentId.toString())
        }

        const microfrontend = await Microfrontend.find({ projectId: environment.projectId }).session(session || null)
        const variables = await GlobalVariable.find({ projectId: environment.projectId }).session(session || null)

        const deployment: Partial<IDeployment> = {
            environmentId: environment._id,
            microfrontends: microfrontend,
            variables: variables
        }

        return await new Deployment(deployment).save({ session })
    }

    async createMultipleRaw(environmentIds: (string | ObjectId)[], session?: ClientSession) {
        const promises = []

        for (const environmentId of environmentIds) {
            promises.push(this.createRaw(environmentId, session))
        }

        return Promise.all(promises)
    }

    async create(environmentId: string | ObjectId) {
        return runInTransaction(async session => this.createRaw(environmentId, session))
    }

    async createMultiple(environmentIds: (string | ObjectId)[]) {
        return runInTransaction(async session => this.createMultipleRaw(environmentIds, session))
    }

    async redeploy(deploymentId: string | ObjectId) {
        const deployment = await Deployment.findById(deploymentId)

        if (!deployment) {
            throw new EntityNotFoundError(deploymentId.toString())
        }

        await this.ensureAccessToEnvironment(deployment.environmentId)

        const newDeployment: Partial<IDeployment> = {
            environmentId: deployment.environmentId,
            microfrontends: deployment.microfrontends,
            variables: deployment.variables
        }

        return await Deployment.create(newDeployment)
    }
}

export default DeploymentService
