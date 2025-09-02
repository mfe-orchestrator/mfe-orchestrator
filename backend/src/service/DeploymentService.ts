import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import Deployment, { IDeployment } from "../models/DeploymentModel"
import Environment from "../models/EnvironmentModel"
import GlobalVariable from "../models/GlobalVariableModel"
import Microfrontend from "../models/MicrofrontendModel"
import BaseAuthorizedService from "./BaseAuthorizedService"
import { ClientSession, ObjectId, Schema, Types } from "mongoose"
import { runInTransaction } from "../utils/runInTransaction"

class DeploymentService extends BaseAuthorizedService {
    async getByEnvironmentId(environmentId: string | ObjectId) {
        await this.ensureAccessToEnvironment(environmentId)
        return Deployment.find({ environmentId }).sort({ deployedAt: -1 })
    }

    private async getDeploymentId(environmentId: Schema.Types.ObjectId | Types.ObjectId, session?: ClientSession) {
        
        const deployments = await Deployment.find({ environmentId }).session(session || null)
        if(!deployments || deployments.length === 0){
            return "#1"
        }else{
            return `#${deployments.length + 1}`
        }
    }

    async createRaw(environmentId: string | ObjectId, session?: ClientSession) {
        await this.ensureAccessToEnvironment(environmentId, session)
        const environmentIdObj = typeof environmentId === "string" ? new Types.ObjectId(environmentId) : environmentId
        const environment = await Environment.findById(environmentIdObj).session(session || null)
        if (!environment) {
            throw new EntityNotFoundError(environmentId.toString())
        }

        const microfrontend = await Microfrontend.find({ projectId: environment.projectId }).session(session || null)
        const variables = await GlobalVariable.find({ environmentId }).session(session || null)

        const deploymentId = await this.getDeploymentId(environmentIdObj, session)


        const deployment =  await new Deployment({
            environmentId: environment._id,
            microfrontends: microfrontend,
            variables: variables,
            deploymentId,
            active: true
        }).save({ session })

        await Deployment.updateMany({ environmentId, _id: { $ne: deployment._id } }, { active: false }, { session })

        return deployment
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

        deployment.active = true
        deployment.deployedAt = new Date()
        await deployment.save()

        await Deployment.updateMany({ environmentId: deployment.environmentId, _id: { $ne: deployment._id } }, { active: false })

        return deployment
    }
}

export default DeploymentService
