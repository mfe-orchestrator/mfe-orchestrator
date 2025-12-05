import { ClientSession, DeleteResult, ObjectId, Schema, Types } from "mongoose"
import { fastify } from ".."
import { BusinessException, createBusinessException } from "../errors/BusinessException"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
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
import BaseAuthorizedService from "./BaseAuthorizedService"
import UserProjectService from "./UserProjectService"

export interface ProjectCreateInput {
    name: string
    slug: string
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

    async findMine(userId: ObjectId): Promise<IProject[]> {
        try {
            const projects: IProject[] = await UserProject.aggregate([
                { $match: { userId } },
                {
                    $lookup: {
                        from: "projects", // ⚠️ nome della collezione Mongo (di default è minuscolo e plurale)
                        localField: "projectId",
                        foreignField: "_id",
                        as: "project"
                    }
                },
                { $unwind: "$project" },
                { $replaceRoot: { newRoot: "$project" } },
                { $sort: { name: 1 } }
            ])
            return projects
        } catch (error) {
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
            throw new EntityNotFoundError(projectId)
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
        return runInTransaction(async session => this.createRaw(projectData, creatorUserId, session))
    }

    async createRaw(projectData: ProjectCreateInput, creatorUserId: ObjectId, session?: ClientSession): Promise<IProject> {
        try {
            const project = new Project({
                name: projectData.name,
                slug: projectData.slug || projectData.name.toLowerCase().replace(" ", "-").replace("_", "-").replace(".", "-"),
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

            // biome-ignore lint/suspicious/noExplicitAny: updateData needs to support MongoDB update operators dynamically
            const updateData: any = { ...projectData }
            if (updateData.description === null) {
                updateData.$unset = { description: 1 }
                delete updateData.description
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
