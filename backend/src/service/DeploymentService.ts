import { ClientSession, Schema } from "mongoose"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import { EnvironmentNotFoundError } from "../errors/EnvironmentNotFoundError"
import Deployment, { IDeployedService, IDeployedVariableMap, IDeployment } from "../models/DeploymentModel"
import Domain from "../models/DomainModel"
import Environment from "../models/EnvironmentModel"
import GlobalVariable from "../models/GlobalVariableModel"
import Microfrontend, { IMicrofrontend } from "../models/MicrofrontendModel"
import Service from "../models/ServiceModel"
import Storage from "../models/StorageModel"
import { ConfigMap, IVariableMap, Secret } from "../models/VariableMapModel"
import { toObjectId } from "../utils/mongooseUtils"
import { runInTransaction } from "../utils/runInTransaction"
import BaseAuthorizedService, { isInDomainScope } from "./BaseAuthorizedService"
import DeploymentCanaryUsersService from "./DeploymentCanaryUsersService"
import GitOpsService from "./GitOpsService"
import { mapIdsInScope } from "./VariableMapService"

/** The keys `map` sets in the environment, as GitOps commits them: with their values for a config map only */
const deployedMap = (map: IVariableMap, environmentId: string, withValues: boolean): IDeployedVariableMap => ({
    _id: map._id,
    name: map.name,
    entries: map.entries.flatMap(entry => {
        const value = entry.values?.find(candidate => String(candidate.environmentId) === environmentId)?.value
        if (value === undefined || value === "") return []
        return [withValues ? { key: entry.key, value } : { key: entry.key }]
    })
})

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
     * The snapshots as a domain-scoped member may read them: only the microfrontends and services of their
     * domains as they are now, one deleted since being nobody's, and the config maps and secrets they may see. The documents are only answered, never
     * saved: what the environment serves stays whole.
     */
    private async withinDomainScope(environmentId: string | Schema.Types.ObjectId, deployments: IDeployment[]): Promise<IDeployment[]> {
        const environment = deployments.length ? await Environment.findById(toObjectId(environmentId), { projectId: 1 }) : null
        const scope = environment ? await this.getDomainScope(environment.projectId) : undefined
        if (!environment || !scope) {
            return deployments
        }
        const filter = { projectId: environment.projectId, ...(await this.domainScopeFilter(environment.projectId)) }
        const visible = new Set([...(await Microfrontend.find(filter, { _id: 1 })), ...(await Service.find(filter, { _id: 1 }))].map(application => String(application._id)))
        const visibleConfigMaps = await mapIdsInScope("configMap", environment.projectId, scope)
        const visibleSecrets = await mapIdsInScope("secret", environment.projectId, scope)
        for (const deployment of deployments) {
            deployment.microfrontends = (deployment.microfrontends ?? []).filter(microfrontend => visible.has(String(microfrontend._id)))
            deployment.services = (deployment.services ?? []).filter(service => visible.has(String(service._id)))
            deployment.configMaps = (deployment.configMaps ?? []).filter(map => visibleConfigMaps.has(String(map._id)))
            deployment.secrets = (deployment.secrets ?? []).filter(map => visibleSecrets.has(String(map._id)))
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

    /**
     * What a domain-scoped member's deploy serves of one kind of application: the ones served already are
     * replaced in their place, the new ones come last. One of their domains, as the snapshot recorded it,
     * that is missing now: deleted, so it goes, or moved out of their reach by someone of the whole
     * project, so it keeps its last version. Another domain's is not theirs to drop, deleted or not.
     * `existing` reads which of the missing ones are still there, in one query.
     */
    private async mergeIntoServed<T extends { _id?: unknown; domainId?: unknown }>(
        served: T[],
        current: T[],
        scope: string[],
        existing: (ids: Schema.Types.ObjectId[]) => Promise<{ _id?: unknown }[]>
    ): Promise<T[]> {
        const now = new Map(current.map(item => [String(item._id), item]))
        const missing = served.filter(item => !now.has(String(item._id)) && isInDomainScope(scope, item.domainId))
        const stillThere = new Set(missing.length > 0 ? (await existing(missing.map(item => item._id as Schema.Types.ObjectId))).map(item => String(item._id)) : [])
        const replaced: T[] = []
        for (const item of served) {
            const latest = now.get(String(item._id))
            if (latest) {
                replaced.push(latest)
            } else if (!isInDomainScope(scope, item.domainId) || stillThere.has(String(item._id))) {
                replaced.push(item)
            }
        }
        const servedIds = new Set(served.map(item => String(item._id)))
        return [...replaced, ...current.filter(item => !servedIds.has(String(item._id)))]
    }

    /**
     * The domains a deploy ships: `domainId` alone for a deploy of one functional domain, which must be of the
     * project and, for a domain-scoped member, one of theirs; otherwise the principal's scope, none for the
     * whole project. Everything outside them is carried over from what the environment serves.
     */
    private async deployScope(projectId: string | Schema.Types.ObjectId, domainId?: string, session?: ClientSession): Promise<string[] | undefined> {
        if (!domainId) return this.getDomainScope(projectId)
        if (!(await Domain.exists({ _id: toObjectId(domainId), projectId: toObjectId(projectId) }).session(session || null))) {
            throw new EntityNotFoundError(domainId)
        }
        await this.ensureInDomainScope(projectId, domainId)
        return [String(domainId)]
    }

    /** Checked before GitOps pushes anything for the deploy: createRaw checks it again, too late for the repositories */
    private async ensureDeployableDomain(environmentIds: (string | Schema.Types.ObjectId)[], domainId?: string) {
        if (!domainId) return
        for (const environmentId of environmentIds) await this.ensureAccessToEnvironment(environmentId)
        const environments = await Environment.find({ _id: { $in: environmentIds.map(id => toObjectId(id)) } }, { projectId: 1 })
        for (const projectId of new Set(environments.map(environment => String(environment.projectId)))) {
            await this.deployScope(projectId, domainId)
        }
    }

    async createRaw(environmentId: string | Schema.Types.ObjectId, session?: ClientSession, domainId?: string) {
        await this.ensureAccessToEnvironment(environmentId, session)
        const environmentIdObj = toObjectId(environmentId)
        const environment = await Environment.findById(environmentIdObj).session(session || null)
        if (!environment) {
            throw new EnvironmentNotFoundError(environmentId.toString())
        }

        const scope = await this.deployScope(environment.projectId, domainId, session)
        const inScope = { projectId: environment.projectId, ...(scope && { domainId: { $in: scope.map(id => toObjectId(id)) } }) }
        const microfrontend = await Microfrontend.find(inScope).session(session || null)
        // With GitOps on, the deploy commits the values of these services at this version
        const service: IDeployedService[] = await Service.find(inScope, { slug: 1, name: 1, domainId: 1, version: 1, image: 1 })
            .session(session || null)
            .lean<IDeployedService[]>()
        let variables: unknown[] = await GlobalVariable.find({ environmentId: environmentIdObj }).session(session || null)
        // Plain objects, not the documents themselves: the snapshot re-encrypts the credentials it
        // copies, and doing that through a live Storage document would encrypt the one the caller is
        // still holding.
        let storages: unknown[] = (await Storage.find({ projectId: environment.projectId }).session(session || null)).map(storage => storage.toObject())
        // GitOps commits every map of the project, a domain-scoped member's deploy too: recorded as they are now.
        // Through the model, as GitOps reads them, so that a secret key is told set from its decrypted value.
        const configMaps = (await ConfigMap.find({ projectId: environment.projectId }).session(session || null)).map(map => deployedMap(map, String(environment._id), true))
        const secrets = (await Secret.find({ projectId: environment.projectId }).session(session || null)).map(map => deployedMap(map, String(environment._id), false))

        const deploymentId = await this.getDeploymentId(environmentIdObj, session)
        const currentDeployment = await this.getCurrentDeployment(environmentIdObj, session)

        // A domain-scoped member, or a deploy of one domain, ships the microfrontends and services of those
        // domains only: everything else the environment serves, the variables and the storages included, is
        // carried over from the deployment it serves now, so that their deploy cannot ship what another domain
        // has not released yet. A copy, for the same reason as the storages above: the snapshot encrypts in
        // place what it saves.
        let microfrontends: unknown[] = microfrontend
        let services: unknown[] = service
        if (scope && currentDeployment) {
            const previous = currentDeployment.toObject() as { microfrontends?: IMicrofrontend[]; services?: IDeployedService[]; variables?: unknown[]; storages?: unknown[] }
            microfrontends = await this.mergeIntoServed<{ _id?: unknown; domainId?: unknown }>(previous.microfrontends ?? [], microfrontend, scope, ids =>
                Microfrontend.find({ _id: { $in: ids }, projectId: environment.projectId }, { _id: 1 }).session(session || null)
            )
            services = await this.mergeIntoServed<{ _id?: unknown; domainId?: unknown }>(previous.services ?? [], service, scope, ids =>
                Service.find({ _id: { $in: ids }, projectId: environment.projectId }, { _id: 1 }).session(session || null)
            )
            variables = previous.variables ?? []
            storages = previous.storages ?? []
        }

        const deployment = await new Deployment({
            environmentId: environment._id,
            microfrontends,
            services,
            configMaps,
            secrets,
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
    async createMultipleRaw(environmentIds: (string | Schema.Types.ObjectId)[], session?: ClientSession, domainId?: string) {
        const deployments: IDeployment[] = []

        for (const environmentId of environmentIds) {
            deployments.push(await this.createRaw(environmentId, session, domainId))
        }

        return deployments
    }

    /** With GitOps on, what the deploy ships is committed first: when the commit does not go through, nothing is deployed */
    async create(environmentId: string | Schema.Types.ObjectId) {
        return new GitOpsService(this.user).deploy([environmentId], () => runInTransaction(async session => this.createRaw(environmentId, session)))
    }

    /** With `domainId`, only the microfrontends and services of that functional domain move */
    async createMultiple(environmentIds: (string | Schema.Types.ObjectId)[], domainId?: string) {
        await this.ensureDeployableDomain(environmentIds, domainId)
        return new GitOpsService(this.user).deploy(environmentIds, () => runInTransaction(async session => this.createMultipleRaw(environmentIds, session, domainId)), domainId)
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
