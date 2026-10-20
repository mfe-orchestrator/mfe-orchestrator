import { ObjectId, Schema } from "mongoose"
import { fastify } from ".."
import AzureDevOpsClient, { AzureDevOpsBuild } from "../client/AzureDevOpsClient"
import GithubClient, { GithubWorkflowRun } from "../client/GithubClient"
import GitlabClient, { GitLabPipeline } from "../client/GitlabClient"
import BuiltFrontend from "../models/BuiltFrontendModel"
import BuiltService from "../models/BuiltServiceModel"
import CodeRepository, { CodeRepositoryProvider, ICodeRepository } from "../models/CodeRepositoryModel"
import Deployment from "../models/DeploymentModel"
import Environment from "../models/EnvironmentModel"
import Microfrontend, { ICodeRepositoryMicrofrontend, MicrofrontendKind } from "../models/MicrofrontendModel"
import ServiceDeployment from "../models/ServiceDeploymentModel"
import Service, { IService } from "../models/ServiceModel"
import { BuildJobLogDTO, BuildRunDTO, BuildStatus, BuildUnavailableReason, ComponentBuildStatusDTO, ProjectBuildStatusDTO } from "../types/BuildStatusDTO"
import { toObjectId } from "../utils/mongooseUtils"
import BaseAuthorizedService from "./BaseAuthorizedService"
import { findLatestFrontendDeployments } from "./FrontendDeploymentService"

/** How many runs per microfrontend or service are read from the provider. */
const RUNS_PER_COMPONENT = 5

/**
 * How long a snapshot is reused before the providers are asked again.
 *
 * Build status is read live from GitHub / GitLab / Azure, with no copy of our own,
 * so every open build screen would otherwise turn into provider traffic. The cache
 * is keyed by project and shared by the snapshot endpoint and the SSE stream, so N
 * viewers of the same project cost the same as one.
 */
const SNAPSHOT_TTL_MS = 15_000

interface CachedSnapshot {
    fetchedAtMs: number
    snapshot: Promise<ProjectBuildStatusDTO>
}

const snapshotCache = new Map<string, CachedSnapshot>()

/** Drops the `refs/heads/` or `refs/tags/` prefix Azure puts on every ref. */
const shortenRef = (ref?: string): string | undefined => ref?.replace(/^refs\/(heads|tags)\//, "")

const toIsoDate = (value?: string | null): string | undefined => (value ? new Date(value).toISOString() : undefined)

/**
 * GitHub reports a run as `status` while it is alive and as `conclusion` once it
 * ended, so both fields have to be read: a completed run has `status: "completed"`,
 * which on its own says nothing about whether it passed.
 */
const normalizeGithubStatus = (run: GithubWorkflowRun): BuildStatus => {
    if (run.status !== "completed") {
        switch (run.status) {
            case "queued":
            case "requested":
            case "pending":
            case "waiting":
                return BuildStatus.QUEUED
            case "in_progress":
                return BuildStatus.RUNNING
            default:
                return BuildStatus.UNKNOWN
        }
    }

    switch (run.conclusion) {
        case "success":
            return BuildStatus.SUCCESS
        case "failure":
        case "timed_out":
        case "startup_failure":
            return BuildStatus.FAILED
        case "cancelled":
        case "skipped":
        case "neutral":
            return BuildStatus.CANCELED
        default:
            return BuildStatus.UNKNOWN
    }
}

const normalizeGitlabStatus = (status: string): BuildStatus => {
    switch (status) {
        case "created":
        case "waiting_for_resource":
        case "preparing":
        case "pending":
        case "scheduled":
        case "manual":
            return BuildStatus.QUEUED
        case "running":
            return BuildStatus.RUNNING
        case "success":
            return BuildStatus.SUCCESS
        case "failed":
            return BuildStatus.FAILED
        case "canceled":
        case "canceling":
        case "skipped":
            return BuildStatus.CANCELED
        default:
            return BuildStatus.UNKNOWN
    }
}

/** Same two-field shape as GitHub: `result` only means something once `status` is `completed`. */
const normalizeAzureStatus = (build: AzureDevOpsBuild): BuildStatus => {
    if (build.status !== "completed") {
        switch (build.status) {
            case "notStarted":
            case "postponed":
            case "none":
                return BuildStatus.QUEUED
            case "inProgress":
                return BuildStatus.RUNNING
            case "cancelling":
                return BuildStatus.CANCELED
            default:
                return BuildStatus.UNKNOWN
        }
    }

    switch (build.result) {
        case "succeeded":
        case "partiallySucceeded":
            return BuildStatus.SUCCESS
        case "failed":
            return BuildStatus.FAILED
        case "canceled":
            return BuildStatus.CANCELED
        default:
            return BuildStatus.UNKNOWN
    }
}

export const toGithubRun = (run: GithubWorkflowRun): BuildRunDTO => ({
    id: String(run.id),
    name: run.name || run.display_title,
    status: normalizeGithubStatus(run),
    ref: run.head_branch || undefined,
    commitSha: run.head_sha,
    url: run.html_url,
    triggeredBy: run.actor?.login,
    startedAt: toIsoDate(run.run_started_at || run.created_at),
    finishedAt: run.status === "completed" ? toIsoDate(run.updated_at) : undefined
})

export const toGitlabRun = (pipeline: GitLabPipeline): BuildRunDTO => {
    const status = normalizeGitlabStatus(pipeline.status)
    return {
        id: String(pipeline.id),
        name: pipeline.name || undefined,
        status,
        ref: pipeline.ref,
        commitSha: pipeline.sha,
        url: pipeline.web_url,
        startedAt: toIsoDate(pipeline.created_at),
        // The list endpoint has no `finished_at`; for a run that is over, `updated_at`
        // is the moment it reached its final status.
        finishedAt: status === BuildStatus.QUEUED || status === BuildStatus.RUNNING ? undefined : toIsoDate(pipeline.updated_at)
    }
}

export const toAzureRun = (build: AzureDevOpsBuild): BuildRunDTO => ({
    id: String(build.id),
    name: build.definition?.name || build.buildNumber,
    status: normalizeAzureStatus(build),
    ref: shortenRef(build.sourceBranch),
    commitSha: build.sourceVersion,
    url: build._links?.web?.href,
    triggeredBy: build.requestedFor?.displayName,
    startedAt: toIsoDate(build.startTime || build.queueTime),
    finishedAt: toIsoDate(build.finishTime)
})

/** Which component a failed run belongs to: exactly one of the two ids is set. */
export type BuildRunOwner = { microfrontendId: string; serviceId?: undefined } | { serviceId: string; microfrontendId?: undefined }

/**
 * What reading the runs of a component needs. A microfrontend and a service link their
 * repository the same way, so everything below works on either.
 */
interface BuildableComponent {
    _id: ObjectId
    projectId: Schema.Types.ObjectId
    name: string
    slug: string
    version?: string
    codeRepository?: ICodeRepositoryMicrofrontend
}

class BuildStatusService extends BaseAuthorizedService {
    /**
     * Build status of every microfrontend (frontend) and service (backend) of a project,
     * read live from the CI providers and joined with the version each environment
     * currently serves.
     *
     * Repeated calls within {@link SNAPSHOT_TTL_MS} share one round of provider
     * calls. The in-flight promise is what gets cached, so two viewers arriving
     * together do not each start their own fetch.
     */
    async getByProjectId(projectId: string | Schema.Types.ObjectId | ObjectId): Promise<ProjectBuildStatusDTO> {
        await this.ensureAccessToProject(projectId)
        return this.withinDomainScope(projectId, await this.getSnapshot(projectId))
    }

    /**
     * The snapshot as a domain-scoped member may read it: the rows of their microfrontends and services
     * only. Filtered after the cache, which holds the whole project and is shared by everyone reading it.
     */
    private async withinDomainScope(projectId: string | Schema.Types.ObjectId | ObjectId, snapshot: ProjectBuildStatusDTO): Promise<ProjectBuildStatusDTO> {
        const inScope = await this.domainScopeFilter(projectId)
        if (Object.keys(inScope).length === 0) {
            return snapshot
        }
        const projectIdObj = toObjectId(projectId)
        const [microfrontends, services] = await Promise.all([
            Microfrontend.find({ projectId: projectIdObj, ...inScope }, { _id: 1 }),
            Service.find({ projectId: projectIdObj, ...inScope }, { _id: 1 })
        ])
        const visible = new Set([...microfrontends, ...services].map(component => String(component._id)))
        return {
            ...snapshot,
            microfrontends: snapshot.microfrontends.filter(row => visible.has(row.microfrontendId)),
            services: snapshot.services.filter(row => visible.has(row.serviceId))
        }
    }

    private async getSnapshot(projectId: string | Schema.Types.ObjectId | ObjectId): Promise<ProjectBuildStatusDTO> {
        const key = projectId.toString()
        const cached = snapshotCache.get(key)
        if (cached && Date.now() - cached.fetchedAtMs < SNAPSHOT_TTL_MS) {
            return cached.snapshot
        }

        const snapshot = this.fetchSnapshot(key).catch(error => {
            // A rejected promise must not stay in the cache, or the whole TTL window
            // would keep replaying the same failure to every caller.
            snapshotCache.delete(key)
            throw error
        })
        snapshotCache.set(key, { fetchedAtMs: Date.now(), snapshot })
        return snapshot
    }

    /**
     * Logs of the failed jobs of one run of a microfrontend or a service, read live from its CI provider.
     *
     * Not cached and not part of the snapshot: logs are large and only ever asked for one
     * run at a time, when somebody wants to know why it failed.
     */
    async getFailedRunLogs(projectId: string, owner: BuildRunOwner, runId: string): Promise<BuildJobLogDTO[]> {
        const isService = owner.serviceId !== undefined
        const component: BuildableComponent | null =
            owner.serviceId !== undefined ? await Service.findById(toObjectId(owner.serviceId)) : await Microfrontend.findById(toObjectId(owner.microfrontendId))
        const label = isService ? "Service" : "Microfrontend"
        // A component of another project is reported as missing: the caller asked about this one.
        if (!component || component.projectId.toString() !== projectId) {
            throw new Error(`${label} not found in this project`)
        }
        await this.ensureAccessToDomainMember(component as BuildableComponent & { domainId?: unknown })

        const codeRepositoryId = component.codeRepository?.enabled ? component.codeRepository.codeRepositoryId : undefined
        const repository = codeRepositoryId ? await CodeRepository.findById(codeRepositoryId) : null
        if (!repository) {
            throw new Error(`The ${label.toLowerCase()} has no code repository connected`)
        }

        if (repository.provider === CodeRepositoryProvider.GITHUB) {
            const repositoryName = component.codeRepository?.name
            if (!repositoryName) return []
            return new GithubClient().getFailedJobLogs(repository.accessToken, repositoryName, runId, repository.githubData?.organizationId, repository.githubData?.userName)
        }

        const repositoryId = component.codeRepository?.repositoryId
        if (!repositoryId) return []

        if (repository.provider === CodeRepositoryProvider.GITLAB) {
            return new GitlabClient(repository.gitlabData?.url || "", repository.accessToken).getFailedJobLogs(repositoryId, runId)
        }

        if (repository.provider === CodeRepositoryProvider.AZURE_DEV_OPS && repository.azureData) {
            return new AzureDevOpsClient().getFailedJobLogs(repository.accessToken, repository.azureData.organization, repository.azureData.projectId, runId)
        }

        return []
    }

    private async fetchSnapshot(projectId: string): Promise<ProjectBuildStatusDTO> {
        const projectIdObj = toObjectId(projectId)

        const [microfrontends, services, environments] = await Promise.all([
            Microfrontend.find({ projectId: projectIdObj }).sort({ name: 1 }),
            Service.find({ projectId: projectIdObj }).sort({ name: 1 }),
            Environment.find({ projectId: projectIdObj }).sort({ order: 1 })
        ])

        const environmentIds = environments.map(environment => environment._id)
        const frontends = microfrontends.filter(microfrontend => microfrontend.kind === MicrofrontendKind.FRONTEND)
        const [versionsByEnvironment, serviceVersionsByEnvironment, frontendVersionsByEnvironment, repositoriesById] = await Promise.all([
            this.getVersionsByEnvironment(environmentIds),
            this.getServiceVersionsByEnvironment(services, environmentIds),
            this.getFrontendVersionsByEnvironment(frontends, environmentIds),
            this.getRepositoriesById([...microfrontends, ...services])
        ])
        const environmentIdStrings = environmentIds.map(environmentId => environmentId.toString())

        const [microfrontendRows, serviceRows] = await Promise.all([
            Promise.all(
                microfrontends.map(async microfrontend => {
                    const lastBuilt = await BuiltFrontend.findOne({ microfrontendId: microfrontend._id }).sort({ createdAt: -1 }).select("version")
                    // A FRONTEND is not in the deployments of the orchestrator as deployed: its pipeline reports where it runs
                    const deployed = microfrontend.kind === MicrofrontendKind.FRONTEND ? frontendVersionsByEnvironment : versionsByEnvironment
                    const versionByEnvironmentId = this.toVersionByEnvironmentId(microfrontend, environmentIdStrings, deployed)
                    return { microfrontendId: microfrontend._id.toString(), ...(await this.toComponentStatus(microfrontend, lastBuilt?.version, versionByEnvironmentId, repositoriesById)) }
                })
            ),
            Promise.all(
                services.map(async service => {
                    const lastBuilt = await BuiltService.findOne({ serviceId: service._id }).sort({ createdAt: -1 }).select("version")
                    const versionByEnvironmentId = this.toVersionByEnvironmentId(service, environmentIdStrings, serviceVersionsByEnvironment)
                    return { serviceId: service._id.toString(), ...(await this.toComponentStatus(service, lastBuilt?.version, versionByEnvironmentId, repositoriesById)) }
                })
            )
        ])

        return {
            projectId,
            fetchedAt: new Date().toISOString(),
            environments: environments.map(environment => ({
                _id: environment._id.toString(),
                name: environment.name,
                slug: environment.slug,
                color: environment.color,
                isProduction: environment.isProduction
            })),
            microfrontends: microfrontendRows,
            services: serviceRows
        }
    }

    /**
     * For each environment, the version every microfrontend is served at, taken from
     * that environment's active deployment. A deployment freezes the microfrontends
     * it shipped, so this is what is actually live, not what the microfrontend points
     * at today.
     */
    private async getVersionsByEnvironment(environmentIds: ObjectId[]): Promise<Map<string, Map<string, string>>> {
        const deployments = await Deployment.find({ environmentId: { $in: environmentIds }, active: true })

        const result = new Map<string, Map<string, string>>()
        for (const deployment of deployments) {
            const versions = new Map<string, string>()
            for (const microfrontend of deployment.microfrontends || []) {
                if (microfrontend?._id && microfrontend?.version) {
                    versions.set(microfrontend._id.toString(), microfrontend.version)
                }
            }
            result.set(deployment.environmentId.toString(), versions)
        }
        return result
    }

    /**
     * For each environment, the version every service runs there: the latest deploy its
     * pipeline reported. The orchestrator does not deploy services, so this is the only
     * account of what is live.
     */
    private async getServiceVersionsByEnvironment(services: IService[], environmentIds: ObjectId[]): Promise<Map<string, Map<string, string>>> {
        const result = new Map<string, Map<string, string>>()
        if (services.length === 0 || environmentIds.length === 0) return result

        const latest = await ServiceDeployment.aggregate<{ _id: { serviceId: ObjectId; environmentId: ObjectId }; version: string }>([
            { $match: { serviceId: { $in: services.map(service => service._id) }, environmentId: { $in: environmentIds } } },
            // Follows the index { serviceId, environmentId, deployedAt, _id }, so the first of each group is the latest deploy
            { $sort: { serviceId: 1, environmentId: 1, deployedAt: -1, _id: -1 } },
            { $group: { _id: { serviceId: "$serviceId", environmentId: "$environmentId" }, version: { $first: "$version" } } }
        ])

        for (const deploy of latest) {
            const environmentId = deploy._id.environmentId.toString()
            const versions = result.get(environmentId) ?? new Map<string, string>()
            versions.set(deploy._id.serviceId.toString(), deploy.version)
            result.set(environmentId, versions)
        }
        return result
    }

    /** As for the services: the latest deploy the pipeline of each FRONTEND reported in each environment */
    private async getFrontendVersionsByEnvironment(frontends: BuildableComponent[], environmentIds: ObjectId[]): Promise<Map<string, Map<string, string>>> {
        const result = new Map<string, Map<string, string>>()
        for (const deploy of await findLatestFrontendDeployments(
            frontends.map(frontend => frontend._id),
            environmentIds
        )) {
            const environmentId = String(deploy._id.environmentId)
            const versions = result.get(environmentId) ?? new Map<string, string>()
            versions.set(String(deploy._id.microfrontendId), deploy.version)
            result.set(environmentId, versions)
        }
        return result
    }

    private toVersionByEnvironmentId(component: BuildableComponent, environmentIds: string[], versionsByEnvironment: Map<string, Map<string, string>>): Record<string, string> {
        const componentId = component._id.toString()
        const versionByEnvironmentId: Record<string, string> = {}
        for (const environmentId of environmentIds) {
            const version = versionsByEnvironment.get(environmentId)?.get(componentId)
            if (version) {
                versionByEnvironmentId[environmentId] = version
            }
        }
        return versionByEnvironmentId
    }

    private async getRepositoriesById(components: BuildableComponent[]): Promise<Map<string, ICodeRepository>> {
        const ids = [
            ...new Set(
                components
                    .filter(component => component.codeRepository?.enabled)
                    .map(component => component.codeRepository?.codeRepositoryId?.toString())
                    .filter(Boolean) as string[]
            )
        ]

        if (ids.length === 0) return new Map()

        const repositories = await CodeRepository.find({ _id: { $in: ids.map(toObjectId) } })
        return new Map(repositories.map(repository => [repository._id.toString(), repository]))
    }

    private async toComponentStatus(
        component: BuildableComponent,
        latestBuiltVersion: string | undefined,
        versionByEnvironmentId: Record<string, string>,
        repositoriesById: Map<string, ICodeRepository>
    ): Promise<ComponentBuildStatusDTO> {
        const base: ComponentBuildStatusDTO = {
            name: component.name,
            slug: component.slug,
            selectedVersion: component.version,
            latestBuiltVersion,
            versionByEnvironmentId,
            builds: []
        }

        if (!component.codeRepository?.enabled) {
            return { ...base, unavailableReason: BuildUnavailableReason.NO_REPOSITORY }
        }

        const repository = repositoriesById.get(component.codeRepository.codeRepositoryId?.toString())
        if (!repository) {
            return { ...base, unavailableReason: BuildUnavailableReason.REPOSITORY_NOT_FOUND }
        }

        const repositoryName = component.codeRepository.name || component.codeRepository.repositoryId
        try {
            return { ...base, provider: repository.provider, repositoryName, builds: await this.getRuns(component, repository) }
        } catch (error) {
            // One unreachable provider must not blank the whole screen: the row keeps
            // its versions and says why its runs are missing.
            fastify.log.warn({ err: error, componentId: component._id.toString() }, "Unable to read build status from the code repository provider")
            return { ...base, provider: repository.provider, repositoryName, unavailableReason: BuildUnavailableReason.PROVIDER_ERROR }
        }
    }

    private async getRuns(component: BuildableComponent, repository: ICodeRepository): Promise<BuildRunDTO[]> {
        const repositoryId = component.codeRepository?.repositoryId

        if (repository.provider === CodeRepositoryProvider.GITHUB) {
            // GitHub addresses a repository by name, the other two by id, so which of
            // the two fields has to be present depends on the provider.
            const repositoryName = component.codeRepository?.name
            if (!repositoryName) return []

            const runs = await new GithubClient().getWorkflowRuns(repository.accessToken, repositoryName, RUNS_PER_COMPONENT, repository.githubData?.organizationId, repository.githubData?.userName)
            return runs.map(toGithubRun)
        }

        if (!repositoryId) return []

        if (repository.provider === CodeRepositoryProvider.GITLAB) {
            const pipelines = await new GitlabClient(repository.gitlabData?.url || "", repository.accessToken).getPipelines(repositoryId, RUNS_PER_COMPONENT)
            return pipelines.map(toGitlabRun)
        }

        if (repository.provider === CodeRepositoryProvider.AZURE_DEV_OPS) {
            if (!repository.azureData) {
                throw new Error("Azure DevOps data not found")
            }
            const builds = await new AzureDevOpsClient().getBuilds(repository.accessToken, repository.azureData.organization, repository.azureData.projectId, repositoryId, RUNS_PER_COMPONENT)
            return builds.map(toAzureRun)
        }

        return []
    }
}

export default BuildStatusService
