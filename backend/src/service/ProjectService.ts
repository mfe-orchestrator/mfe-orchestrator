import { ClientSession, DeleteResult, ObjectId, Schema, Types } from "mongoose"
import { fastify } from ".."
import { BusinessException, createBusinessException } from "../errors/BusinessException"
import CustomError from "../errors/CustomError"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import { ProjectNotFoundError } from "../errors/ProjectNotFoundError"
import ApiKey from "../models/ApiKeyModel"
import BuiltFrontend from "../models/BuiltFrontendModel"
import CodeRepository from "../models/CodeRepositoryModel"
import Deployment from "../models/DeploymentModel"
import DeploymentToCanaryUsers from "../models/DeploymentsToCanaryUsersModel"
import Environment from "../models/EnvironmentModel"
import Microfrontend from "../models/MicrofrontendModel"
import Project, { IProject, IProjectPipelines } from "../models/ProjectModel"
import Storage from "../models/StorageModel"
import UserProject, { RoleInProject } from "../models/UserProjectModel"
import { toObjectId } from "../utils/mongooseUtils"
import { runInTransaction } from "../utils/runInTransaction"
import { slugify } from "../utils/slugUtils"
import BaseAuthorizedService from "./BaseAuthorizedService"
import CodeRepositoryImportService from "./CodeRepositoryImportService"
import CodeRepositoryService from "./CodeRepositoryService"
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

interface ContextEntry {
    id: string
    slug: string
    name: string
    context: string
}

/** What the team wrote for AI agents in one project: the shared context and the one of each microfrontend that has it. */
export interface ProjectContextDTO {
    project: { id: string; name: string; context?: string }
    microfrontends: ContextEntry[]
}

/** The piece of work a context is read for: a microfrontend reads its own context. The project context always comes along. */
type ContextFocus = { microfrontendId: string }

const toContextEntry = (item: { _id: unknown; slug: string; name: string; context?: string }): ContextEntry => ({
    id: String(item._id),
    slug: item.slug,
    name: item.name,
    context: item.context as string
})

export interface ProjectSummaryDTO {
    project: IProject
    count: {
        environments: number
        users: number
        microfrontends: number
        apiKeys: number
        storages: number
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
    async findMine(userId: ObjectId, organizationId?: string | Schema.Types.ObjectId): Promise<IProject[]> {
        try {
            // A pending invitation is not a membership yet: it must be accepted first, otherwise the
            // project would show up in the switcher as if it were already the user's.
            const memberships = await UserProject.find({ userId: toObjectId(userId), invitationToken: null }, { projectId: 1 }).lean()
            const administeredOrganizations = await this.getAdministeredOrganizationIds()

            const reachable: Record<string, unknown>[] = [{ _id: { $in: memberships.map(membership => membership.projectId) } }]
            if (administeredOrganizations.length > 0) {
                reachable.push({ organizationId: { $in: administeredOrganizations } })
            }

            const filter: Record<string, unknown> = { $or: reachable }
            if (organizationId) {
                filter.organizationId = toObjectId(organizationId)
            }

            return await Project.find(filter).sort({ name: 1 })
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
                microfrontends: await Microfrontend.countDocuments({ projectId: projectIdObj }),
                apiKeys: await ApiKey.countDocuments({ projectId: projectIdObj }),
                storages: await Storage.countDocuments({ projectId: projectIdObj }),
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
        const filter = focus ? { _id: toObjectId(focus.microfrontendId) } : {}
        // A focus outside the project is refused as not found: a context never reaches across projects
        if (focus && !(await Microfrontend.exists({ ...filter, projectId: projectIdObj }))) {
            throw new EntityNotFoundError(focus.microfrontendId)
        }
        const microfrontends = await Microfrontend.find({ ...filter, projectId: projectIdObj, context: { $nin: [null, ""] } }, { slug: 1, name: 1, context: 1 }).sort({ slug: 1 })
        return {
            project: { id: project._id.toString(), name: project.name, context: project.context || undefined },
            microfrontends: microfrontends.map(toContextEntry)
        }
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
            if (projectData.pipelines !== undefined) {
                const pipelines = await this.resolvePipelines(projectId, projectData.pipelines)
                if (pipelines) updateData.pipelines = pipelines
                else updateData.$unset = { ...updateData.$unset, pipelines: 1 }
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
            // A not found, or a refusal of the pipeline templates, keeps its own status and code
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
     * The pipeline templates to store from what the screen sent, none for the official ones. Owners only:
     * every repository scaffolded in the project runs what they pick. The repository must be reachable
     * through one of the connections of the project: one of another project would lend this one its access token.
     */
    private async resolvePipelines(projectId: string, input: PipelineTemplatesInput | null): Promise<IProjectPipelines | undefined> {
        const projectIdObj = toObjectId(projectId)
        const project = await Project.findById(projectIdObj, { organizationId: 1 })
        if (!project) throw new ProjectNotFoundError(projectId)
        await this.ensureOwner(projectIdObj, project.organizationId)
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

    /** An owner of the project or an administrator of its organization: an API key has no person behind it to be one */
    private async ensureOwner(projectId: Schema.Types.ObjectId, organizationId: Schema.Types.ObjectId) {
        const user = this.getUser()
        if (user && !this.user?.apiKeyId) {
            const membership = await UserProject.findOne({ userId: user._id, projectId, invitationToken: null })
            if (membership?.role === RoleInProject.OWNER || (await this.isOrganizationAdmin(organizationId))) return
        }
        throw createBusinessException({ code: "PIPELINES_OWNER_REQUIRED", message: "Only an owner of the project can change where its pipeline templates come from", statusCode: 403 })
    }

    async delete(projectId: string): Promise<DeleteResult> {
        await this.ensureAccessToProject(projectId)
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
        await CodeRepository.deleteMany({ projectId: projectIdObj }, session)

        const microfrontends = await Microfrontend.find({ projectId: projectIdObj }, {}, { session })
        const mfeIds = microfrontends.map(mfe => mfe._id)
        await BuiltFrontend.deleteMany({ microfrontendId: { $in: mfeIds } }, session)

        const deployments = await Deployment.find({ projectId: projectIdObj }, {}, { session })
        const deploymentsIds = deployments.map(deployment => deployment._id)
        await DeploymentToCanaryUsers.deleteMany({ deploymentId: { $in: deploymentsIds } }, session)

        const environments = await Environment.find({ projectId: projectIdObj }, {}, { session })
        const environmentIds = environments.map(environment => environment._id)
        await Deployment.deleteMany({ environmentId: { $in: environmentIds } }, session)

        await Deployment.deleteMany({ projectId: projectIdObj }, session)
        await Microfrontend.deleteMany({ projectId: projectIdObj }, session)
        await Environment.deleteMany({ projectId: projectIdObj }, session)

        return await Project.deleteOne({ _id: projectIdObj }, session)
    }
}

export default ProjectService
