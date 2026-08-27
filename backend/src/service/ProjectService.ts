import { ClientSession, DeleteResult, ObjectId, Schema, Types } from "mongoose"
import { fastify } from ".."
import { BusinessException, createBusinessException } from "../errors/BusinessException"
import { ProjectNotFoundError } from "../errors/ProjectNotFoundError"
import ApiKey from "../models/ApiKeyModel"
import BuiltFrontend from "../models/BuiltFrontendModel"
import CodeRepository from "../models/CodeRepositoryModel"
import Deployment from "../models/DeploymentModel"
import DeploymentToCanaryUsers from "../models/DeploymentsToCanaryUsersModel"
import Environment from "../models/EnvironmentModel"
import Microfrontend from "../models/MicrofrontendModel"
import Project, { IProject } from "../models/ProjectModel"
import Storage from "../models/StorageModel"
import UserProject, { RoleInProject } from "../models/UserProjectModel"
import { toObjectId } from "../utils/mongooseUtils"
import { runInTransaction } from "../utils/runInTransaction"
import { slugify } from "../utils/slugUtils"
import BaseAuthorizedService from "./BaseAuthorizedService"
import UserProjectService from "./UserProjectService"

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
    isActive?: boolean
}

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
            if (projectData.description === null) {
                updateData.$unset = { description: 1 }
            } else if (projectData.description !== undefined) {
                updateData.description = projectData.description
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
            if (error instanceof BusinessException) throw error

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

    async delete(projectId: string): Promise<DeleteResult> {
        return runInTransaction(session => this.deleteRaw(projectId, session))
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
