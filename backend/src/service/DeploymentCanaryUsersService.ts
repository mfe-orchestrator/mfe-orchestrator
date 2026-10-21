import { ClientSession, ObjectId, Schema } from "mongoose"
import DeploymentToCanaryUsers, { IDeploymentToCanaryUsers } from "../models/DeploymentsToCanaryUsersModel"
import { toObjectId } from "../utils/mongooseUtils"
import { runInTransaction } from "../utils/runInTransaction"
import BaseAuthorizedService from "./BaseAuthorizedService"

class DeploymentCanaryUsersService extends BaseAuthorizedService {
    async getCanaryUsersByDeployment(deploymentId: string | ObjectId): Promise<IDeploymentToCanaryUsers[]> {
        return DeploymentToCanaryUsers.find({ deploymentId: toObjectId(deploymentId) })
    }

    async getCanaryUsersByDeploymentWithPermissionCheck(deploymentId: string | ObjectId) {
        await this.ensureAccessToDeployment(deploymentId)
        return this.getCanaryUsersByDeployment(deploymentId)
    }

    async setCanaryUserRaw(deploymentId: string | Schema.Types.ObjectId, userId: string, enabled: boolean, session?: ClientSession) {
        const deploymentToCanaryUser = await DeploymentToCanaryUsers.findOne({ deploymentId: toObjectId(deploymentId), userId }).session(session || null)

        if (deploymentToCanaryUser) {
            deploymentToCanaryUser.enabled = enabled
            await deploymentToCanaryUser.save({ session })
            return deploymentToCanaryUser
        } else {
            return await new DeploymentToCanaryUsers({ deploymentId: toObjectId(deploymentId), userId, enabled }).save({ session })
        }
    }

    /**
     * The users are written one at a time on purpose: a transaction runs every operation on a single
     * session, and MongoDB refuses two commands carrying the same transaction number at once
     * ("Only servers in a sharded cluster can start a new transaction at the active transaction number").
     * Firing the writes with Promise.all did exactly that as soon as more than one user was passed.
     */
    async setCanaryUserMultipleRaw(deploymentId: string | ObjectId, userIds: string[], enabled: boolean, session?: ClientSession) {
        const canaryUsers: IDeploymentToCanaryUsers[] = []
        for (const userId of userIds) {
            canaryUsers.push(await this.setCanaryUserRaw(deploymentId, userId, enabled, session))
        }

        return canaryUsers
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

    /**
     * Enrolment is stored per deployment, so a fresh deployment would start with nobody on the canary
     * and every enrolled user would silently drop back to the stable version. Carrying the rows over
     * keeps the same people on the canary across a deployment, scoped rows included.
     */
    async copyCanaryUsersRaw(fromDeploymentId: string | ObjectId | Schema.Types.ObjectId, toDeploymentId: string | ObjectId | Schema.Types.ObjectId, session?: ClientSession) {
        const canaryUsers = await DeploymentToCanaryUsers.find({ deploymentId: toObjectId(fromDeploymentId) }).session(session || null)

        if (canaryUsers.length === 0) {
            return []
        }

        return DeploymentToCanaryUsers.insertMany(
            canaryUsers.map(canaryUser => ({
                deploymentId: toObjectId(toDeploymentId),
                microfrontendId: canaryUser.microfrontendId,
                userId: canaryUser.userId,
                enabled: canaryUser.enabled
            })),
            { session }
        )
    }

    async deleteCanaryUsers(deploymentId: string | Schema.Types.ObjectId, userIds: string[]) {
        await DeploymentToCanaryUsers.deleteMany({ deploymentId: toObjectId(deploymentId), userId: { $in: userIds } })
    }

    async deleteCanaryUsersWithPermissionCheck(deploymentId: string | ObjectId, userIds: string[]) {
        await this.ensureAccessToDeployment(deploymentId)
        return this.deleteCanaryUsers(deploymentId, userIds)
    }
}

export default DeploymentCanaryUsersService
