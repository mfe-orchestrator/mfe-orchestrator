import { ClientSession, ObjectId } from "mongoose"
import BaseAuthorizedService from "./BaseAuthorizedService"
import DeploymentToCanaryUsers from "../models/DeploymentsToCanaryUsersModel"
import { runInTransaction } from "../utils/runInTransaction"

class DeploymentCanaryUsersService extends BaseAuthorizedService {
    async getCanaryUsersByDeployment(deploymentId: string | ObjectId) {
        const users = await DeploymentToCanaryUsers.findById(deploymentId)

        if (!users) {
            return []
        }

        return users
    }

    async getCanaryUsersByDeploymentWithPermissionCheck(deploymentId: string | ObjectId) {
        await this.ensureAccessToDeployment(deploymentId)
        return this.getCanaryUsersByDeployment(deploymentId)
    }

    async setCanaryUserRaw(deploymentId: string | ObjectId, userId: string, enabled: boolean, session?: ClientSession) {
        const deploymentToCanaryUser = await DeploymentToCanaryUsers.findOne({ deploymentId, userId }).session(session || null)

        if (deploymentToCanaryUser) {
            deploymentToCanaryUser.enabled = enabled
            await deploymentToCanaryUser.save({ session })
            return deploymentToCanaryUser
        } else {
            const newDeploymentToCanaryUser = await DeploymentToCanaryUsers.create({ deploymentId, userId, enabled }, { session })
            return newDeploymentToCanaryUser
        }
    }

    async setCanaryUserMultipleRaw(deploymentId: string | ObjectId, userIds: string[], enabled: boolean, session?: ClientSession) {
        const promises = []
        for (const userId of userIds) {
            promises.push(this.setCanaryUserRaw(deploymentId, userId, enabled, session))
        }

        return Promise.all(promises)
    }

    async setCanaryUser(deploymentId: string | ObjectId, userId: string, enabled: boolean) {
        return runInTransaction(async session => this.setCanaryUserRaw(deploymentId, userId, enabled, session))
    }

    async setCanaryUserMultiple(deploymentId: string | ObjectId, userIds: string[], enabled: boolean) {
        return runInTransaction(async session => this.setCanaryUserMultipleRaw(deploymentId, userIds, enabled, session))
    }

    async setCanaryUserWithPermissionCheck(deploymentId: string | ObjectId, userId: string, enabled: boolean) {
        await this.ensureAccessToDeployment(deploymentId)
        return this.setCanaryUser(deploymentId, userId, enabled)
    }

    async setCanaryUserMultipleWithPermissionCheck(deploymentId: string | ObjectId, userIds: string[], enabled: boolean) {
        await this.ensureAccessToDeployment(deploymentId)
        return this.setCanaryUserMultiple(deploymentId, userIds, enabled)
    }

    async deleteCanaryUsers(deploymentId: string | ObjectId, userIds: string[]) {
        await DeploymentToCanaryUsers.deleteMany({ deploymentId, userId: { $in: userIds } })
    }

    async deleteCanaryUsersWithPermissionCheck(deploymentId: string | ObjectId, userIds: string[]) {
        await this.ensureAccessToDeployment(deploymentId)
        return this.deleteCanaryUsers(deploymentId, userIds)
    }
}

export default DeploymentCanaryUsersService
