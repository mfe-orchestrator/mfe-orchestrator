import { ClientSession, DeleteResult, ObjectId, Types } from "mongoose"
import Project, { IProject } from "../models/ProjectModel"
import { BusinessException, createBusinessException } from "../errors/BusinessException"
import UserProjectService from "./UserProjectService"
import UserProject, { RoleInProject } from "../models/UserProjectModel"
import { runInTransaction } from "../utils/runInTransaction"
import BaseAuthorizedService from "./BaseAuthorizedService"
import Environment from "../models/EnvironmentModel"
import Microfrontend from "../models/MicrofrontendModel"
import ApiKey from "../models/ApiKeyModel"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import Storage from "../models/StorageModel"

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

export interface ProjectSummaryDTO{
    project : IProject,
    count : {
        environments : number,
        users : number,
        microfrontends : number,
        apiKeys : number,
        storages : number
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
                details: { error: error instanceof Error ? error.message : "Unknown error" },
                statusCode: 500
            })
        }
    }

    async findById(id: string | ObjectId): Promise<IProject | null> {
        const projectIdObj = typeof id === "string" ? new Types.ObjectId(id) : id
        await this.ensureAccessToProject(projectIdObj)
        try {
            return await Project.findById(projectIdObj).lean()
        } catch (error) {
            if (error instanceof BusinessException) throw error

            throw createBusinessException({
                code: "PROJECT_FETCH_ERROR",
                message: "Failed to fetch project",
                details: { error: error instanceof Error ? error.message : "Unknown error" },
                statusCode: 500
            })
        }
    }

    async getSummary(projectId: string): Promise<ProjectSummaryDTO> {        
        const project = await this.findById(projectId)
        if (!project) {
            throw new EntityNotFoundError(projectId);
        }
        return {
            project,
            count: {
                environments : await Environment.countDocuments({projectId}),
                users: await UserProject.countDocuments({projectId}),
                microfrontends: await Microfrontend.countDocuments({projectId}),
                apiKeys: await ApiKey.countDocuments({projectId}),
                storages: await Storage.countDocuments({projectId})
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

            await this.userProjectService.addUserToProject(creatorUserId, savedProject._id, RoleInProject.OWNER, session)

            return savedProject
        } catch (error: any) {
            if (error.code === 11000) {
                // Duplicate key error
                throw createBusinessException({
                    code: "DUPLICATE_PROJECT",
                    message: "A project with this name already exists",
                    statusCode: 409
                })
            }

            throw createBusinessException({
                code: "PROJECT_CREATION_ERROR",
                message: "Failed to create project",
                details: { error: error.message },
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

            const updateData: any = { ...projectData }
            if (updateData.description === null) {
                updateData.$unset = { description: 1 }
                delete updateData.description
            }

            const updated = await Project.findByIdAndUpdate(projectId, updateData, { new: true, runValidators: true }).lean()

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
                details: { error: error instanceof Error ? error.message : "Unknown error" },
                statusCode: 500
            })
        }
    }

    async delete(projectId: string): Promise<DeleteResult> {
        await this.ensureAccessToProject(projectId)

        return await Project.deleteOne({ _id: projectId })
    }
}

export default ProjectService
