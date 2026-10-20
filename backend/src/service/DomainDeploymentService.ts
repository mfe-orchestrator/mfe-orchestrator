import { ObjectId, Schema } from "mongoose"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import Deployment from "../models/DeploymentModel"
import Domain from "../models/DomainModel"
import Environment from "../models/EnvironmentModel"
import Microfrontend, { CanaryDeploymentType, CanaryType, ICanaryMicrofrontend, MicrofrontendKind } from "../models/MicrofrontendModel"
import ServiceDeployment from "../models/ServiceDeploymentModel"
import Service from "../models/ServiceModel"
import { toObjectId } from "../utils/mongooseUtils"
import BaseAuthorizedService from "./BaseAuthorizedService"
import DomainService from "./DomainService"
import { findLatestFrontendDeployments } from "./FrontendDeploymentService"

export interface DomainDeploymentDomain {
    _id: unknown
    name: string
    slug: string
}

export interface DomainDeploymentMicrofrontend {
    _id: unknown
    slug: string
    name: string
    /** MICROFRONTEND for the ones stored before the kind existed */
    kind: MicrofrontendKind
    /**
     * As frozen in the deployment that environment serves; null when it was never deployed there. For a
     * FRONTEND, the latest version its deploy pipeline reported there, as for a service.
     */
    version: string | null
    /**
     * Only when the canary was enabled in that deployment. `percentage` only means something for the
     * RANDOM and ON_SESSION types (ON_USER serves the enrolled users); `version` is null for a canary based on a
     * URL. Always null for a FRONTEND, which the orchestrator does not serve.
     */
    canary: { type: CanaryType; deploymentType: CanaryDeploymentType; percentage: number; version: string | null } | null
}

export interface DomainDeploymentServiceVersion {
    _id: unknown
    slug: string
    name: string
    /** The latest version the deploy pipeline reported for that environment; null when it reported none */
    version: string | null
    deployedAt: Date | null
}

export interface DomainDeploymentEnvironment {
    environment: { _id: unknown; name: string; slug: string; color: string; isProduction: boolean }
    /** The deployment the environment serves, null when nothing was ever deployed there */
    deployment: { deploymentId: string; deployedAt: Date } | null
    microfrontends: DomainDeploymentMicrofrontend[]
    services: DomainDeploymentServiceVersion[]
}

export interface DomainDeployments {
    /** null for the members that are in no domain */
    domain: DomainDeploymentDomain | null
    environments: DomainDeploymentEnvironment[]
}

type Member = { _id: unknown; slug: string; name: string; domainId?: unknown; kind?: MicrofrontendKind }
type Environments = Awaited<ReturnType<typeof findEnvironments>>
type SnapshotMicrofrontend = { _id: unknown; version?: string; canary?: ICanaryMicrofrontend }
type CurrentDeployment = { _id: unknown; environmentId: unknown; deploymentId: string; deployedAt: Date; microfrontends?: SnapshotMicrofrontend[] }
type LatestServiceDeployment = { _id: { serviceId: unknown; environmentId: unknown }; version: string; deployedAt: Date }

const MEMBER_FIELDS = { slug: 1, name: 1, domainId: 1 }
const MICROFRONTEND_FIELDS = { ...MEMBER_FIELDS, kind: 1 }

const isFrontend = (member: Member) => member.kind === MicrofrontendKind.FRONTEND
/** Only what is shown: the snapshot also carries the variables and the storage credentials */
const DEPLOYMENT_FIELDS = { environmentId: 1, deploymentId: 1, deployedAt: 1, "microfrontends._id": 1, "microfrontends.version": 1, "microfrontends.canary": 1 }

const findEnvironments = (projectId: Schema.Types.ObjectId) => Environment.find({ projectId }, { name: 1, slug: 1, color: 1, isProduction: 1, order: 1 }).sort({ order: 1, createdAt: 1 })

const toDomain = (domain: DomainDeploymentDomain): DomainDeploymentDomain => ({ _id: domain._id, name: domain.name, slug: domain.slug })

/**
 * What each environment runs, in a fixed number of queries whatever the number of environments and members:
 * the deployment each one serves (the active one, or the most recent when none is flagged, as the
 * deployment service picks it) and the latest deploy the pipelines reported for each service there.
 *
 * The deployment is picked on scalars only, then read alone: sorting whole snapshots would load the
 * full history of every environment on each call.
 */
const findVersions = async (environments: Environments, services: Member[], microfrontends: Member[]) => {
    const environmentIds = environments.map(environment => environment._id)
    const [currentDeploymentIds, serviceDeployments, frontendDeployments] = await Promise.all([
        environmentIds.length === 0
            ? []
            : Deployment.aggregate<{ _id: ObjectId; id: ObjectId }>([
                  { $match: { environmentId: { $in: environmentIds } } },
                  { $project: { environmentId: 1, active: 1, deployedAt: 1 } },
                  // Follows the index { environmentId, active, deployedAt }
                  { $sort: { active: -1, deployedAt: -1 } },
                  { $group: { _id: "$environmentId", id: { $first: "$_id" } } }
              ]),
        environmentIds.length === 0 || services.length === 0
            ? []
            : ServiceDeployment.aggregate<LatestServiceDeployment>([
                  { $match: { serviceId: { $in: services.map(service => service._id) }, environmentId: { $in: environmentIds } } },
                  // Follows the index { serviceId, environmentId, deployedAt, _id }, so the first of each group is the latest deploy
                  { $sort: { serviceId: 1, environmentId: 1, deployedAt: -1, _id: -1 } },
                  { $group: { _id: { serviceId: "$serviceId", environmentId: "$environmentId" }, version: { $first: "$version" }, deployedAt: { $first: "$deployedAt" } } }
              ]),
        findLatestFrontendDeployments(
            microfrontends.filter(isFrontend).map(frontend => frontend._id),
            environmentIds
        )
    ])
    const deployments = currentDeploymentIds.length === 0 ? [] : await Deployment.find({ _id: { $in: currentDeploymentIds.map(current => current.id) } }, DEPLOYMENT_FIELDS).lean<CurrentDeployment[]>()

    const deploymentByEnvironment = new Map(
        deployments.map(deployment => [
            String(deployment.environmentId),
            { deployment, microfrontends: new Map((deployment.microfrontends ?? []).map(microfrontend => [String(microfrontend._id), microfrontend])) }
        ])
    )
    const serviceDeploymentByKey = new Map(serviceDeployments.map(deploy => [`${deploy._id.serviceId}:${deploy._id.environmentId}`, deploy]))
    const frontendDeploymentByKey = new Map(frontendDeployments.map(deploy => [`${deploy._id.microfrontendId}:${deploy._id.environmentId}`, deploy]))
    return { deploymentByEnvironment, serviceDeploymentByKey, frontendDeploymentByKey }
}

const buildEnvironments = (environments: Environments, microfrontends: Member[], services: Member[], versions: Awaited<ReturnType<typeof findVersions>>): DomainDeploymentEnvironment[] =>
    environments.map(environment => {
        const current = versions.deploymentByEnvironment.get(String(environment._id))
        return {
            environment: { _id: environment._id, name: environment.name, slug: environment.slug, color: environment.color, isProduction: Boolean(environment.isProduction) },
            deployment: current ? { deploymentId: current.deployment.deploymentId, deployedAt: current.deployment.deployedAt } : null,
            microfrontends: microfrontends.map(microfrontend => {
                if (isFrontend(microfrontend)) {
                    const deploy = versions.frontendDeploymentByKey.get(`${microfrontend._id}:${environment._id}`)
                    return { _id: microfrontend._id, slug: microfrontend.slug, name: microfrontend.name, kind: MicrofrontendKind.FRONTEND, version: deploy?.version ?? null, canary: null }
                }
                const snapshot = current?.microfrontends.get(String(microfrontend._id))
                return {
                    _id: microfrontend._id,
                    slug: microfrontend.slug,
                    name: microfrontend.name,
                    kind: MicrofrontendKind.MICROFRONTEND,
                    version: snapshot?.version ?? null,
                    canary: snapshot?.canary?.enabled
                        ? {
                              type: snapshot.canary.type,
                              deploymentType: snapshot.canary.deploymentType,
                              percentage: snapshot.canary.percentage,
                              version: snapshot.canary.deploymentType === CanaryDeploymentType.BASED_ON_URL ? null : (snapshot.canary.version ?? null)
                          }
                        : null
                }
            }),
            services: services.map(service => {
                const deploy = versions.serviceDeploymentByKey.get(`${service._id}:${environment._id}`)
                return { _id: service._id, slug: service.slug, name: service.name, version: deploy?.version ?? null, deployedAt: deploy?.deployedAt ?? null }
            })
        }
    })

/**
 * Which version of each microfrontend (frontend) and service (backend) of a domain runs in each
 * environment. A microfrontend's version is the one frozen in the deployment the environment serves;
 * a service's, and a FRONTEND's, is the latest one the customer's deploy pipeline reported, since the
 * orchestrator deploys neither. Members are the ones in the domain now, environments come in their order.
 */
export class DomainDeploymentService extends BaseAuthorizedService {
    async getByDomainId(domainId: string | ObjectId): Promise<{ domain: DomainDeploymentDomain; environments: DomainDeploymentEnvironment[] }> {
        // Checks the access to the project of the domain
        const domain = await new DomainService(this.user).getById(domainId)
        if (!domain) {
            throw new EntityNotFoundError(String(domainId))
        }
        const [environments, microfrontends, services] = await Promise.all([
            findEnvironments(domain.projectId),
            Microfrontend.find({ projectId: domain.projectId, domainId: domain._id }, MICROFRONTEND_FIELDS).sort({ name: 1 }),
            Service.find({ projectId: domain.projectId, domainId: domain._id }, MEMBER_FIELDS).sort({ name: 1 })
        ])
        const versions = await findVersions(environments, services, microfrontends)
        return { domain: toDomain(domain as unknown as DomainDeploymentDomain), environments: buildEnvironments(environments, microfrontends, services, versions) }
    }

    /** One entry per domain of the project, by name, then one for the members in no domain when there are any */
    async getByProjectId(projectId: string | Schema.Types.ObjectId): Promise<DomainDeployments[]> {
        const projectIdObj = toObjectId(projectId)
        await this.ensureAccessToProject(projectIdObj)
        // A domain-scoped member gets their domains only: their members are all in one of them, so the
        // entry for the members in no domain never shows up for them
        const [domainsInScope, membersInScope] = await Promise.all([this.domainScopeFilter(projectIdObj, "_id"), this.domainScopeFilter(projectIdObj)])
        const [domains, environments, microfrontends, services] = await Promise.all([
            Domain.find({ projectId: projectIdObj, ...domainsInScope }, { name: 1, slug: 1 }).sort({ name: 1 }),
            findEnvironments(projectIdObj),
            Microfrontend.find({ projectId: projectIdObj, ...membersInScope }, MICROFRONTEND_FIELDS).sort({ name: 1 }),
            Service.find({ projectId: projectIdObj, ...membersInScope }, MEMBER_FIELDS).sort({ name: 1 })
        ])
        const versions = await findVersions(environments, services, microfrontends)

        // A member pointing at a domain that is gone counts as in no domain, as the domain filters treat it
        const domainIds = new Set(domains.map(domain => String(domain._id)))
        const inDomain = (member: Member, domainId: string | null) => (member.domainId && domainIds.has(String(member.domainId)) ? String(member.domainId) : null) === domainId
        const entry = (domain: DomainDeploymentDomain | null): DomainDeployments => {
            const key = domain ? String(domain._id) : null
            return {
                domain: domain && toDomain(domain),
                environments: buildEnvironments(
                    environments,
                    microfrontends.filter(member => inDomain(member, key)),
                    services.filter(member => inDomain(member, key)),
                    versions
                )
            }
        }

        const result = domains.map(domain => entry(domain as unknown as DomainDeploymentDomain))
        if (microfrontends.some(member => inDomain(member, null)) || services.some(member => inDomain(member, null))) {
            result.push(entry(null))
        }
        return result
    }
}

export default DomainDeploymentService
