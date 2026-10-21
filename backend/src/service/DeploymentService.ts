import { ClientSession, Schema } from "mongoose"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import { EnvironmentNotFoundError } from "../errors/EnvironmentNotFoundError"
import Deployment, { IDeployment } from "../models/DeploymentModel"
import Environment from "../models/EnvironmentModel"
import GlobalVariable from "../models/GlobalVariableModel"
import Microfrontend, { IMicrofrontend } from "../models/MicrofrontendModel"
import Storage from "../models/StorageModel"
import { toObjectId } from "../utils/mongooseUtils"
import { runInTransaction } from "../utils/runInTransaction"
import BaseAuthorizedService, { isInDomainScope } from "./BaseAuthorizedService"
import DeploymentCanaryUsersService from "./DeploymentCanaryUsersService"
import GitOpsService from "./GitOpsService"

class DeploymentService extends BaseAuthorizedService {
    async getById(deploymentId: string | Schema.Types.ObjectId): Promise<IDeployment | null> {
        return Deployment.findById(toObjectId(deploymentId))
    }

    async getByEnvironmentId(environmentId: string | Schema.Types.ObjectId): Promise<IDeployment[]> {
        await this.ensureAccessToEnvironment(environmentId)
        const deployments = await Deployment.find({ environmentId: toObjectId(environmentId) }).sort({ deployedAt: -1 })
        return this.withinDomainScope(environmentId, deployments)
    }

    async getLastByEnvironmentId(environmentId: string | Schema.Types.ObjectId): Promise<IDeployment | null> {
        await this.ensureAccessToEnvironment(environmentId)
        const deployment = await Deployment.findOne({ environmentId: toObjectId(environmentId) }).sort({ deployedAt: -1 })
        return deployment && (await this.withinDomainScope(environmentId, [deployment]))[0]
    }

    /**
     * The snapshots as a domain-scoped member may read them: only the microfrontends of their domains as
     * they are now, a microfrontend deleted since being nobody's. The documents are only answered, never
     * saved: what the environment serves stays whole.
     */
    private async withinDomainScope(environmentId: string | Schema.Types.ObjectId, deployments: IDeployment[]): Promise<IDeployment[]> {
        const environment = deployments.length ? await Environment.findById(toObjectId(environmentId), { projectId: 1 }) : null
        const scope = environment ? await this.getDomainScope(environment.projectId) : undefined
        if (!environment || !scope) {
            return deployments
        }
        const visible = new Set(
            (await Microfrontend.find({ projectId: environment.projectId, ...(await this.domainScopeFilter(environment.projectId)) }, { _id: 1 })).map(microfrontend => String(microfrontend._id))
        )
        for (const deployment of deployments) {
            deployment.microfrontends = (deployment.microfrontends ?? []).filter(microfrontend => visible.has(String(microfrontend._id)))
        }
        return deployments
    }

    /**
     * Whether a deploy of the principal to the environment ships the variables of the deployment served now
     * rather than the current ones, as createRaw does for a domain-scoped member: a confirmation must show
     * what will actually be served.
     */
    async shipsServedVariables(environmentId: string | Schema.Types.ObjectId): Promise<boolean> {
        await this.ensureAccessToEnvironment(environmentId)
        const environment = await Environment.findById(toObjectId(environmentId), { projectId: 1 })
        return Boolean(environment && (await this.getDomainScope(environment.projectId)))
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

        const scope = await this.getDomainScope(environment.projectId)
        const microfrontend = await Microfrontend.find({ projectId: environment.projectId, ...(await this.domainScopeFilter(environment.projectId)) }).session(session || null)
        let variables: unknown[] = await GlobalVariable.find({ environmentId: environmentIdObj }).session(session || null)
        // Plain objects, not the documents themselves: the snapshot re-encrypts the credentials it
        // copies, and doing that through a live Storage document would encrypt the one the caller is
        // still holding.
        let storages: unknown[] = (await Storage.find({ projectId: environment.projectId }).session(session || null)).map(storage => storage.toObject())

        const deploymentId = await this.getDeploymentId(environmentIdObj, session)
        const currentDeployment = await this.getCurrentDeployment(environmentIdObj, session)

        // A domain-scoped member deploys their own microfrontends only: everything else the environment
        // serves, the variables and the storages included, is carried over from the deployment it serves
        // now, so that their deploy cannot ship what another domain has not released yet. A copy, for the
        // same reason as the storages above: the snapshot encrypts in place what it saves.
        let microfrontends: unknown[] = microfrontend
        if (scope && currentDeployment) {
            const previous = currentDeployment.toObject() as { microfrontends?: IMicrofrontend[]; variables?: unknown[]; storages?: unknown[] }
            // Each in its place: the ones served already are replaced, the new ones come last
            const current = new Map(microfrontend.map(item => [String(item._id), item]))
            // One of their domains, as the snapshot recorded it, that is missing now: deleted, so it goes,
            // or moved out of their reach by someone of the whole project, so it keeps its last version.
            // Another domain's is not theirs to drop, deleted or not. Those still there are read in one query.
            const missing = (previous.microfrontends ?? []).filter(item => !current.has(String(item._id)) && isInDomainScope(scope, item.domainId))
            const stillThere = new Set(
                missing.length > 0
                    ? (await Microfrontend.find({ _id: { $in: missing.map(item => item._id) }, projectId: environment.projectId }, { _id: 1 }).session(session || null)).map(item => String(item._id))
                    : []
            )
            const replaced: unknown[] = []
            for (const item of previous.microfrontends ?? []) {
                const now = current.get(String(item._id))
                if (now) {
                    replaced.push(now)
                } else if (!isInDomainScope(scope, item.domainId) || stillThere.has(String(item._id))) {
                    replaced.push(item)
                }
            }
            const served = new Set((previous.microfrontends ?? []).map(item => String(item._id)))
            microfrontends = [...replaced, ...microfrontend.filter(item => !served.has(String(item._id)))]
            variables = previous.variables ?? []
            storages = previous.storages ?? []
        }

        const deployment = await new Deployment({
            environmentId: environment._id,
            microfrontends,
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

    /** With GitOps on, what the deploy ships is committed first: when the commit does not go through, nothing is deployed */
    async create(environmentId: string | Schema.Types.ObjectId) {
        return new GitOpsService(this.user).deploy([environmentId], () => runInTransaction(async session => this.createRaw(environmentId, session)))
    }

    async createMultiple(environmentIds: (string | Schema.Types.ObjectId)[]) {
        return new GitOpsService(this.user).deploy(environmentIds, () => runInTransaction(async session => this.createMultipleRaw(environmentIds, session)))
    }

    async redeploy(deploymentId: string | Schema.Types.ObjectId) {
        const deployment = await Deployment.findById(deploymentId)

        if (!deployment) {
            throw new EntityNotFoundError(deploymentId.toString())
        }

        await this.ensureAccessToEnvironment(deployment.environmentId)
        // Serving an older snapshot again rolls back every domain at once
        await this.ensureWholeProjectOfEnvironment(deployment.environmentId)

        deployment.active = true
        deployment.deployedAt = new Date()
        await deployment.save()

        await Deployment.updateMany({ environmentId: deployment.environmentId, _id: { $ne: deployment._id } }, { active: false })

        return deployment
    }
}

export default DeploymentService
