import { ClientSession, DeleteResult, ObjectId, Schema, Types } from "mongoose"
import { fastify } from ".."
import { BusinessException, createBusinessException } from "../errors/BusinessException"
import CustomError from "../errors/CustomError"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import { ProjectNotFoundError } from "../errors/ProjectNotFoundError"
import ApiKey from "../models/ApiKeyModel"
import BuiltFrontend from "../models/BuiltFrontendModel"
import BuiltService from "../models/BuiltServiceModel"
import CodeRepository from "../models/CodeRepositoryModel"
import Database from "../models/DatabaseModel"
import Deployment from "../models/DeploymentModel"
import DeploymentToCanaryUsers from "../models/DeploymentsToCanaryUsersModel"
import Domain from "../models/DomainModel"
import Environment from "../models/EnvironmentModel"
import Microfrontend from "../models/MicrofrontendModel"
import Project, { IProject, IProjectPipelines } from "../models/ProjectModel"
import ServiceDeployment from "../models/ServiceDeploymentModel"
import Service from "../models/ServiceModel"
import Storage from "../models/StorageModel"
import UserProject, { RoleInProject } from "../models/UserProjectModel"
import { ConfigMap, Secret } from "../models/VariableMapModel"
import { CERTIFICATE_ISSUER, DOMAIN_NAME, isListenerPort } from "../types/Exposure"
import { toObjectId } from "../utils/mongooseUtils"
import { runInTransaction } from "../utils/runInTransaction"
import { slugify } from "../utils/slugUtils"
import BaseAuthorizedService, { domainScopeForbidden, isInDomainScope } from "./BaseAuthorizedService"
import CodeRepositoryImportService from "./CodeRepositoryImportService"
import CodeRepositoryService from "./CodeRepositoryService"
import GitOpsService, { GitOpsSettingsInput } from "./GitOpsService"
import UserProjectService from "./UserProjectService"
import { prepareProjectCleanup } from "./workspace/workspaceCleanup"

export interface ProjectCreateInput {
    /** The organization the project is created in. A project always belongs to exactly one. */
    organizationId: string
    name: string
    /** Left out, it is derived from the name with the same helper the organization uses. */
    slug?: string
    description?: string
    isActive?: boolean
}

export interface ProjectUpdateInput {
    name?: string
    description?: string | null
    /** `null` removes it, like the description. */
    context?: string | null
    isActive?: boolean
    /** Turning it on commits every config map and secret to the repository: refused when that push fails */
    gitOps?: GitOpsSettingsInput
    /** Replaced as a whole, `null` removes it: the next deploy of each environment takes its Gateway away */
    exposure?: { domain: string; certificateIssuer?: string | null; httpPort?: number | null; httpsPort?: number | null } | null
    /** Replaced as a whole, `null` goes back to the official template-pipelines */
    pipelines?: PipelineTemplatesInput | null
}

/** The repository of the pipeline templates as the settings screen names it: by the provider id, the backend resolves the rest */
export interface PipelineTemplatesInput {
    codeRepositoryId: string
    repositoryId: string
    /** A branch or a tag; the default branch of the repository when empty */
    ref?: string | null
}

/** What git takes as a branch or a tag name, without the forms it refuses: `..`, a leading dash, a trailing slash or `.lock` */
const GIT_REF = /^(?!-)(?!.*\.\.)(?!.*\/$)(?!.*\.lock$)[A-Za-z0-9._/-]{1,255}$/

/** The exposure to store, trimmed and in lowercase: refused with a 400 rather than by the model with a 500 */
const exposureOf = (input: unknown): { domain: string; certificateIssuer?: string; httpPort?: number; httpsPort?: number } => {
    const { domain, certificateIssuer, httpPort, httpsPort } = (input ?? {}) as { domain?: unknown; certificateIssuer?: unknown; httpPort?: unknown; httpsPort?: unknown }
    const normalized = typeof domain === "string" ? domain.trim().toLowerCase() : ""
    const issuer = typeof certificateIssuer === "string" ? certificateIssuer.trim() : ""
    if (
        !DOMAIN_NAME.test(normalized) ||
        (certificateIssuer != null && typeof certificateIssuer !== "string") ||
        (issuer && !CERTIFICATE_ISSUER.test(issuer)) ||
        (httpPort != null && !isListenerPort(httpPort)) ||
        (httpsPort != null && !isListenerPort(httpsPort))
    ) {
        throw createBusinessException({
            code: "PROJECT_EXPOSURE_INVALID",
            message: "The exposure needs a lowercase domain of at least two labels, e.g. example.com, if any the name of a ClusterIssuer and, if any, ports between 1 and 65535",
            statusCode: 400
        })
    }
    return {
        domain: normalized,
        ...(issuer ? { certificateIssuer: issuer } : {}),
        ...(httpPort != null ? { httpPort: httpPort as number } : {}),
        ...(httpsPort != null ? { httpsPort: httpsPort as number } : {})
    }
}

interface ContextEntry {
    id: string
    slug: string
    name: string
    context: string
}

/** What the team wrote for AI agents in one project: the shared context and the one of each domain, microfrontend and service that has it. */
export interface ProjectContextDTO {
    project: { id: string; name: string; context?: string }
    domains: ContextEntry[]
    microfrontends: ContextEntry[]
    services: ContextEntry[]
}

/**
 * The piece of work a context is read for. A microfrontend or a service reads its own context and
 * the one of its domain; a domain reads its own and the one of each of its microfrontends and services.
 * The project context always comes along.
 */
export type ContextFocus = { microfrontendId: string } | { serviceId: string } | { domainId: string }

/** Which domains, microfrontends and services a focus reads the context of: a list left out is read for none. */
interface ContextFilters {
    domains?: Record<string, unknown>
    microfrontends?: Record<string, unknown>
    services?: Record<string, unknown>
}

const toContextEntry = (item: { _id: unknown; slug: string; name: string; context?: string }): ContextEntry => ({
    id: String(item._id),
    slug: item.slug,
    name: item.name,
    context: item.context as string
})

/**
 * A project as the switcher lists it, with the domains the user is confined to there: none for a member
 * of the whole project. `domainScoped` tells a scope left over nothing by deleted domains from the whole project.
 */
export type ProjectOfUser = IProject & { domainIds: string[]; domainScoped: boolean }

export interface ProjectSummaryDTO {
    project: IProject
    count: {
        environments: number
        users: number
        microfrontends: number
        apiKeys: number
        storages: number
        databases: number
        codeRepositories: number
    }
}

export class ProjectService extends BaseAuthorizedService {
    userProjectService = new UserProjectService()

    /**
     * The projects the user can open, optionally narrowed to one organization.
     *
     * Two ways in, and they are not the same thing: an explicit membership on the project, or
     * administering the organization that owns it. The second is what keeps a project reachable when
     * its members leave, and it is why this cannot be a single lookup from UserProject any more.
     */
    async findMine(userId: ObjectId, organizationId?: string | Schema.Types.ObjectId): Promise<ProjectOfUser[]> {
        try {
            // A pending invitation is not a membership yet: it must be accepted first, otherwise the
            // project would show up in the switcher as if it were already the user's.
            const memberships = await UserProject.find({ userId: toObjectId(userId), invitationToken: null }, { projectId: 1, role: 1, domainScoped: 1, domainIds: 1 }).lean()
            const administeredOrganizations = await this.getAdministeredOrganizationIds()

            const reachable: Record<string, unknown>[] = [{ _id: { $in: memberships.map(membership => membership.projectId) } }]
            if (administeredOrganizations.length > 0) {
                reachable.push({ organizationId: { $in: administeredOrganizations } })
            }

            const filter: Record<string, unknown> = { $or: reachable }
            if (organizationId) {
                filter.organizationId = toObjectId(organizationId)
            }

            // The scope comes with the membership read above; owning the project or administering the
            // organization overrides it, as it does on every check
            const administered = new Set(administeredOrganizations.map(String))
            const scopes = new Map(
                memberships
                    .filter(membership => membership.domainScoped && membership.role !== RoleInProject.OWNER)
                    .map(membership => [String(membership.projectId), (membership.domainIds ?? []).map(String)])
            )
            const projects = await Project.find(filter).sort({ name: 1 })
            return projects.map(project => {
                const scope = administered.has(String(project.organizationId)) ? undefined : scopes.get(String(project._id))
                const fields = typeof project.toJSON === "function" ? project.toJSON() : project
                return { ...fields, domainIds: scope ?? [], domainScoped: Boolean(scope) } as unknown as ProjectOfUser
            })
        } catch (error) {
            if (error instanceof BusinessException) throw error

            throw createBusinessException({
                code: "PROJECT_FETCH_ERROR",
                message: "Failed to fetch projects",
                details: {
                    error: error instanceof Error ? error.message : "Unknown error"
                },
                statusCode: 500
            })
        }
    }

    async findById(id: string | Schema.Types.ObjectId, session?: ClientSession): Promise<IProject | null> {
        const projectIdObj = toObjectId(id)
        await this.ensureAccessToProject(projectIdObj, session)
        try {
            return await Project.findById(projectIdObj, {}, session)
        } catch (error) {
            if (error instanceof BusinessException) throw error

            throw createBusinessException({
                code: "PROJECT_FETCH_ERROR",
                message: "Failed to fetch project",
                details: {
                    error: error instanceof Error ? error.message : "Unknown error"
                },
                statusCode: 500
            })
        }
    }

    async getSummary(projectId: string): Promise<ProjectSummaryDTO> {
        const projectIdObj = toObjectId(projectId)
        const project = await this.findById(projectIdObj)
        if (!project) {
            throw new ProjectNotFoundError(projectId)
        }
        return {
            project,
            count: {
                environments: await Environment.countDocuments({ projectId: projectIdObj }),
                users: await UserProject.countDocuments({ projectId: projectIdObj }),
                microfrontends: await Microfrontend.countDocuments({ projectId: projectIdObj, ...(await this.domainScopeFilter(projectIdObj)) }),
                apiKeys: await ApiKey.countDocuments({ projectId: projectIdObj }),
                storages: await Storage.countDocuments({ projectId: projectIdObj }),
                databases: await Database.countDocuments({ projectId: projectIdObj }),
                codeRepositories: await CodeRepository.countDocuments({ projectId: projectIdObj })
            }
        }
    }

    /** The contexts of the whole project, or only the ones a piece of work needs when a focus is given. */
    async getContext(projectId: string, focus?: ContextFocus): Promise<ProjectContextDTO> {
        const projectIdObj = toObjectId(projectId)
        const project = await this.findById(projectIdObj)
        if (!project) {
            throw new ProjectNotFoundError(projectId)
        }
        const filters = await this.contextFilters(projectIdObj, focus)
        const withContext = { projectId: projectIdObj, context: { $nin: [null, ""] } }
        const fields = { slug: 1, name: 1, context: 1 }
        const [domains, microfrontends, services] = await Promise.all([
            filters.domains ? Domain.find({ ...filters.domains, ...withContext }, fields).sort({ slug: 1 }) : [],
            filters.microfrontends ? Microfrontend.find({ ...filters.microfrontends, ...withContext }, fields).sort({ slug: 1 }) : [],
            filters.services ? Service.find({ ...filters.services, ...withContext }, fields).sort({ slug: 1 }) : []
        ])
        return {
            project: { id: project._id.toString(), name: project.name, context: project.context || undefined },
            domains: domains.map(toContextEntry),
            microfrontends: microfrontends.map(toContextEntry),
            services: services.map(toContextEntry)
        }
    }

    /**
     * A focus outside the project is refused as not found: a context never reaches across projects. A
     * domain-scoped member reads the contexts of their domains and of what is in them only, and is
     * refused a focus outside them.
     */
    private async contextFilters(projectId: Schema.Types.ObjectId, focus?: ContextFocus): Promise<ContextFilters> {
        const scope = await this.getDomainScope(projectId)
        if (!focus) {
            const members = await this.domainScopeFilter(projectId)
            return { domains: await this.domainScopeFilter(projectId, "_id"), microfrontends: members, services: members }
        }
        const domainOf = (domainId?: unknown) => (domainId ? { _id: domainId } : undefined)
        const ensureInScope = (domainId: unknown) => {
            if (!isInDomainScope(scope, domainId)) throw domainScopeForbidden()
        }
        if ("domainId" in focus) {
            const domain = await Domain.findOne({ _id: toObjectId(focus.domainId), projectId }, { _id: 1 })
            if (!domain) throw new EntityNotFoundError(focus.domainId)
            ensureInScope(domain._id)
            return { domains: { _id: domain._id }, microfrontends: { domainId: domain._id }, services: { domainId: domain._id } }
        }
        if ("microfrontendId" in focus) {
            const microfrontend = await Microfrontend.findOne({ _id: toObjectId(focus.microfrontendId), projectId }, { domainId: 1 })
            if (!microfrontend) throw new EntityNotFoundError(focus.microfrontendId)
            ensureInScope(microfrontend.domainId)
            return { domains: domainOf(microfrontend.domainId), microfrontends: { _id: microfrontend._id } }
        }
        const service = await Service.findOne({ _id: toObjectId(focus.serviceId), projectId }, { domainId: 1 })
        if (!service) throw new EntityNotFoundError(focus.serviceId)
        ensureInScope(service.domainId)
        return { domains: domainOf(service.domainId), services: { _id: service._id } }
    }

    async create(projectData: ProjectCreateInput, creatorUserId: ObjectId): Promise<IProject> {
        // Outside the transaction on purpose: the check reads, and a failing authorization should not
        // be the reason a transaction is opened at all.
        await this.ensureCanCreateProjectsIn(projectData.organizationId)
        return runInTransaction(async session => this.createRaw(projectData, creatorUserId, session))
    }

    /**
     * Only whoever administers the organization may open a project in it.
     *
     * A plain member reaches the projects they were invited to and nothing else, so letting them
     * create one would be the one way for them to add something to a tenant they only visit.
     */
    private async ensureCanCreateProjectsIn(organizationId?: string): Promise<void> {
        if (!organizationId) {
            throw createBusinessException({
                code: "ORGANIZATION_REQUIRED",
                message: "A project must be created inside an organization",
                statusCode: 400
            })
        }
        await this.ensureOrganizationAdmin(organizationId)
    }

    async createRaw(projectData: ProjectCreateInput, creatorUserId: ObjectId, session?: ClientSession): Promise<IProject> {
        try {
            const project = new Project({
                organizationId: toObjectId(projectData.organizationId),
                name: projectData.name,
                slug: projectData.slug?.trim() || slugify(projectData.name),
                description: projectData.description,
                isActive: projectData.isActive ?? true
            })

            const savedProject = await project.save({ session })

            fastify.log.info("Project created with ID:" + savedProject._id)

            await this.userProjectService.addUserToProject(creatorUserId, savedProject._id, RoleInProject.OWNER, session)

            return savedProject
        } catch (error: unknown) {
            if (error && typeof error === "object" && "code" in error && error.code === 11000) {
                // Duplicate key error
                throw createBusinessException({
                    code: "DUPLICATE_PROJECT",
                    message: "A project with this name already exists",
                    statusCode: 409
                })
            }

            const errorMessage = error instanceof Error ? error.message : String(error)
            throw createBusinessException({
                code: "PROJECT_CREATION_ERROR",
                message: "Failed to create project",
                details: { error: errorMessage },
                statusCode: 500
            })
        }
    }

    async update(projectId: string, projectData: ProjectUpdateInput): Promise<IProject | null> {
        await this.ensureAccessToProject(projectId)
        // The settings, the shared context and the GitOps repository are the whole project's
        await this.ensureWholeProject(projectId)
        try {
            if (!Types.ObjectId.isValid(projectId)) {
                throw createBusinessException({
                    code: "INVALID_ID",
                    message: "Invalid project ID format",
                    statusCode: 400
                })
            }

            // One field at a time rather than a spread of the request body. The route carries no
            // schema, so a spread would write whatever the caller decides to send: `slug` included,
            // and that one is part of the path already uploaded bundles live under
            // (`<slug>-<id>/<microfrontend>/<version>`). Moving it would orphan every deployed file.
            // biome-ignore lint/suspicious/noExplicitAny: updateData needs to support MongoDB update operators dynamically
            const updateData: any = {}
            if (projectData.name !== undefined) {
                updateData.name = projectData.name
            }
            if (projectData.isActive !== undefined) {
                updateData.isActive = projectData.isActive
            }
            if (projectData.gitOps !== undefined) {
                updateData.gitOps = await new GitOpsService(this.user).resolveSettings(projectId, projectData.gitOps)
            }
            if (projectData.pipelines !== undefined) {
                const pipelines = await this.resolvePipelines(projectId, projectData.pipelines)
                if (pipelines) updateData.pipelines = pipelines
                else updateData.$unset = { ...updateData.$unset, pipelines: 1 }
            }
            if (projectData.exposure === null) {
                updateData.$unset = { ...updateData.$unset, exposure: 1 }
            } else if (projectData.exposure !== undefined) {
                updateData.exposure = exposureOf(projectData.exposure)
            }
            for (const field of ["description", "context"] as const) {
                if (projectData[field] === null) {
                    updateData.$unset = { ...updateData.$unset, [field]: 1 }
                } else if (projectData[field] !== undefined) {
                    updateData[field] = projectData[field]
                }
            }

            const updated = await Project.findByIdAndUpdate(projectId, updateData, {
                new: true,
                runValidators: true
            })

            if (!updated) {
                throw createBusinessException({
                    code: "PROJECT_NOT_FOUND",
                    message: "Project not found",
                    statusCode: 404
                })
            }

            return updated
        } catch (error) {
            // A not found, or a GitOps refusal, keeps its own status and code
            if (error instanceof CustomError) throw error

            throw createBusinessException({
                code: "PROJECT_UPDATE_ERROR",
                message: "Failed to update project",
                details: {
                    error: error instanceof Error ? error.message : "Unknown error"
                },
                statusCode: 500
            })
        }
    }

    /**
     * The pipeline templates to store from what the screen sent, none for the official ones. Owners only, as for
     * GitOps: every repository scaffolded in the project runs what they pick. The repository must be reachable
     * through one of the connections of the project: one of another project would lend this one its access token.
     */
    private async resolvePipelines(projectId: string, input: PipelineTemplatesInput | null): Promise<IProjectPipelines | undefined> {
        const projectIdObj = toObjectId(projectId)
        const project = await Project.findById(projectIdObj, { organizationId: 1 })
        if (!project) throw new ProjectNotFoundError(projectId)
        await new GitOpsService(this.user).ensureOwner(projectIdObj, project.organizationId, {
            code: "PIPELINES_OWNER_REQUIRED",
            message: "Only an owner of the project can change where its pipeline templates come from"
        })
        if (input === null) return undefined

        if (!Types.ObjectId.isValid(input?.codeRepositoryId) || typeof input.repositoryId !== "string" || !input.repositoryId) {
            throw createBusinessException({ code: "PIPELINES_REPOSITORY_REQUIRED", message: "Pick the connection and the repository of the pipeline templates" })
        }
        const ref = typeof input.ref === "string" ? input.ref.trim() : ""
        if ((input.ref != null && typeof input.ref !== "string") || (ref && !GIT_REF.test(ref))) {
            throw createBusinessException({ code: "PIPELINES_REF_INVALID", message: "The ref of the pipeline templates must be the name of a branch or a tag" })
        }

        const codeRepository = await CodeRepository.findOne({ _id: toObjectId(input.codeRepositoryId), projectId: projectIdObj, isActive: true })
        if (!codeRepository) {
            throw createBusinessException({ code: "PIPELINES_REPOSITORY_INVALID", message: "The code repository connection is not one of this project" })
        }
        const importService = new CodeRepositoryImportService(this.user)
        const repository = (await importService.fetchRepositories(new CodeRepositoryService(this.user), codeRepository)).find(candidate => candidate.repositoryId === input.repositoryId)
        if (!repository) {
            throw createBusinessException({ code: "PIPELINES_REPOSITORY_INVALID", message: `The connection "${codeRepository.name}" cannot reach the repository ${input.repositoryId}` })
        }
        return { codeRepository: importService.buildMicrofrontendCodeRepository(codeRepository, repository), ...(ref ? { ref } : {}) }
    }

    async delete(projectId: string): Promise<DeleteResult> {
        await this.ensureAccessToProject(projectId)
        await this.ensureWholeProject(projectId)
        const cleanup = await prepareProjectCleanup(projectId)
        const result = await runInTransaction(session => this.deleteRaw(projectId, session))
        await cleanup()
        return result
    }

    async deleteRaw(projectId: string, session?: ClientSession): Promise<DeleteResult> {
        const projectIdObj = toObjectId(projectId)
        await this.ensureAccessToProject(projectIdObj, session)
        await UserProject.deleteMany({ projectId: projectIdObj }, session)
        await ApiKey.deleteMany({ projectId: projectIdObj }, session)
        await Storage.deleteMany({ projectId: projectIdObj }, session)
        await Database.deleteMany({ projectId: projectIdObj }, { session })
        await CodeRepository.deleteMany({ projectId: projectIdObj }, session)

        const microfrontends = await Microfrontend.find({ projectId: projectIdObj }, {}, { session })
        const mfeIds = microfrontends.map(mfe => mfe._id)
        await BuiltFrontend.deleteMany({ microfrontendId: { $in: mfeIds } }, session)

        const services = await Service.find({ projectId: projectIdObj }, { _id: 1 }, { session })
        await BuiltService.deleteMany({ serviceId: { $in: services.map(service => service._id) } }, session)
        await ServiceDeployment.deleteMany({ serviceId: { $in: services.map(service => service._id) } }, { session })

        const deployments = await Deployment.find({ projectId: projectIdObj }, {}, { session })
        const deploymentsIds = deployments.map(deployment => deployment._id)
        await DeploymentToCanaryUsers.deleteMany({ deploymentId: { $in: deploymentsIds } }, session)

        const environments = await Environment.find({ projectId: projectIdObj }, {}, { session })
        const environmentIds = environments.map(environment => environment._id)
        await Deployment.deleteMany({ environmentId: { $in: environmentIds } }, session)

        await Deployment.deleteMany({ projectId: projectIdObj }, session)
        await Microfrontend.deleteMany({ projectId: projectIdObj }, session)
        await Service.deleteMany({ projectId: projectIdObj }, session)
        await ConfigMap.deleteMany({ projectId: projectIdObj }, { session })
        await Secret.deleteMany({ projectId: projectIdObj }, { session })
        await Domain.deleteMany({ projectId: projectIdObj }, { session })
        await Environment.deleteMany({ projectId: projectIdObj }, session)

        return await Project.deleteOne({ _id: projectIdObj }, session)
    }
}

export default ProjectService
