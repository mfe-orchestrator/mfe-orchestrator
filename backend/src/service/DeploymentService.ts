import { ClientSession, Schema } from "mongoose"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import { EnvironmentNotFoundError } from "../errors/EnvironmentNotFoundError"
import Deployment, { IDeployment } from "../models/DeploymentModel"
import Environment from "../models/EnvironmentModel"
import GlobalVariable from "../models/GlobalVariableModel"
import Microfrontend from "../models/MicrofrontendModel"
import Storage from "../models/StorageModel"
import { toObjectId } from "../utils/mongooseUtils"
import { runInTransaction } from "../utils/runInTransaction"
import BaseAuthorizedService from "./BaseAuthorizedService"
import DeploymentCanaryUsersService from "./DeploymentCanaryUsersService"

class DeploymentService extends BaseAuthorizedService {
    async getById(deploymentId: string | Schema.Types.ObjectId): Promise<IDeployment | null> {
        return Deployment.findById(toObjectId(deploymentId))
    }

    async getByEnvironmentId(environmentId: string | Schema.Types.ObjectId): Promise<IDeployment[]> {
        await this.ensureAccessToEnvironment(environmentId)
        return Deployment.find({ environmentId: toObjectId(environmentId) }).sort({ deployedAt: -1 })
    }

    async getLastByEnvironmentId(environmentId: string | Schema.Types.ObjectId): Promise<IDeployment | null> {
        await this.ensureAccessToEnvironment(environmentId)
        return Deployment.findOne({ environmentId: toObjectId(environmentId) }).sort({ deployedAt: -1 })
    }

    async getLastByEnvironmentIdNoAccessCheck(environmentId: string | Schema.Types.ObjectId): Promise<IDeployment | null> {
        return Deployment.findOne({ environmentId: toObjectId(environmentId) }).sort({ deployedAt: -1 })
    }

    private async getDeploymentId(environmentId: string | Schema.Types.ObjectId, session?: ClientSession) {
        const deployments = await Deployment.find({ environmentId: toObjectId(environmentId) }).session(session || null)
        if (!deployments || deployments.length === 0) {
            return "#1"
        } else {
            return `#${deployments.length + 1}`
        }
    }

    /**
     * The deployment the environment is serving right now, which a new one is about to replace: the
     * active one, or the most recent when none is flagged active.
     */
    private async getCurrentDeployment(environmentId: Schema.Types.ObjectId, session?: ClientSession) {
        return Deployment.findOne({ environmentId })
            .sort({ active: -1, deployedAt: -1 })
            .session(session || null)
    }

    async createRaw(environmentId: string | Schema.Types.ObjectId, session?: ClientSession) {
        await this.ensureAccessToEnvironment(environmentId, session)
        const environmentIdObj = toObjectId(environmentId)
        const environment = await Environment.findById(environmentIdObj).session(session || null)
        if (!environment) {
            throw new EnvironmentNotFoundError(environmentId.toString())
        }

        const microfrontend = await Microfrontend.find({ projectId: environment.projectId }).session(session || null)
        const variables = await GlobalVariable.find({ environmentId: environmentIdObj }).session(session || null)
        const storages = await Storage.find({ projectId: environment.projectId }).session(session || null)

        const deploymentId = await this.getDeploymentId(environmentIdObj, session)
        const currentDeployment = await this.getCurrentDeployment(environmentIdObj, session)

        const deployment = await new Deployment({
            environmentId: environment._id,
            microfrontends: microfrontend,
            variables: variables,
            storages: storages,
            deploymentId,
            active: true
        }).save({ session })

        await Deployment.updateMany({ environmentId: environmentIdObj, _id: { $ne: deployment._id } }, { active: false }, { session })

        if (currentDeployment) {
            await new DeploymentCanaryUsersService(this.user).copyCanaryUsersRaw(currentDeployment._id, deployment._id, session)
        }

        return deployment
    }

    /** Sequential like setCanaryUserMultipleRaw: one session cannot carry two concurrent commands inside a transaction. */
    async createMultipleRaw(environmentIds: (string | Schema.Types.ObjectId)[], session?: ClientSession) {
        const deployments: IDeployment[] = []

        for (const environmentId of environmentIds) {
            deployments.push(await this.createRaw(environmentId, session))
        }

        return deployments
    }

    async create(environmentId: string | Schema.Types.ObjectId) {
        return runInTransaction(async session => this.createRaw(environmentId, session))
    }

    async createMultiple(environmentIds: (string | Schema.Types.ObjectId)[]) {
        return runInTransaction(async session => this.createMultipleRaw(environmentIds, session))
    }

    async redeploy(deploymentId: string | Schema.Types.ObjectId) {
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
