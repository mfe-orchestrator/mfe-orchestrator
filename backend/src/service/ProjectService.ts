import mongoose, { ClientSession, FilterQuery, ObjectId, Types } from 'mongoose';
import Project, { IProject } from '../models/ProjectModel';
import { BusinessException, createBusinessException } from '../errors/BusinessException';
import UserProjectService from './UserProjectService';
import { RoleInProject } from '../models/UserProjectModel';
import { runInTransaction } from '../utils/runInTransaction';

export interface ProjectCreateInput {
  name: string;
  description?: string;
  isActive?: boolean;
}

export interface ProjectUpdateInput {
  name?: string;
  description?: string | null;
  isActive?: boolean;
}

export class ProjectService {

  userProjectService = new UserProjectService();

  async findAll(filter: FilterQuery<IProject> = {}): Promise<IProject[]> {
    try {
      return await Project.find(filter).sort({ createdAt: -1 }).lean();
    } catch (error) {
      throw createBusinessException({
        code: 'PROJECT_FETCH_ERROR',
        message: 'Failed to fetch projects',
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
        statusCode: 500,
      });
    }
  }

  async findById(id: string): Promise<IProject | null> {
    try {
      if (!Types.ObjectId.isValid(id)) {
        throw createBusinessException({
          code: 'INVALID_ID',
          message: 'Invalid project ID format',
          statusCode: 400,
        });
      }
      return await Project.findById(id).lean();
    } catch (error) {
      if (error instanceof BusinessException) throw error;
      
      throw createBusinessException({
        code: 'PROJECT_FETCH_ERROR',
        message: 'Failed to fetch project',
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
        statusCode: 500,
      });
    }
  }

  async create(projectData: ProjectCreateInput, creatorUserId: ObjectId): Promise<IProject> {
    return runInTransaction(async (session) => 
      this.createRaw(projectData, creatorUserId, session)
    )
  }

  async createRaw(projectData: ProjectCreateInput, creatorUserId: ObjectId, session: ClientSession): Promise<IProject> {
    try {
      const project = new Project({
        name: projectData.name,
        description: projectData.description,
        isActive: projectData.isActive ?? true,
      });

      const savedProject =  await project.save({ session });

      await this.userProjectService.addUserToProject(savedProject._id, creatorUserId, RoleInProject.OWNER, session);

      return savedProject;
    } catch (error: any) {
      if (error.code === 11000) { // Duplicate key error
        throw createBusinessException({
          code: 'DUPLICATE_PROJECT',
          message: 'A project with this name already exists',
          statusCode: 409,
        });
      }
      
      throw createBusinessException({
        code: 'PROJECT_CREATION_ERROR',
        message: 'Failed to create project',
        details: { error: error.message },
        statusCode: 500,
      });
    }
  }

  async update(id: string, projectData: ProjectUpdateInput): Promise<IProject | null> {
    try {
      if (!Types.ObjectId.isValid(id)) {
        throw createBusinessException({
          code: 'INVALID_ID',
          message: 'Invalid project ID format',
          statusCode: 400,
        });
      }
      
      const updateData: any = { ...projectData };
      if (updateData.description === null) {
        updateData.$unset = { description: 1 };
        delete updateData.description;
      }

      const updated = await Project.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      ).lean();

      if (!updated) {
        throw createBusinessException({
          code: 'PROJECT_NOT_FOUND',
          message: 'Project not found',
          statusCode: 404,
        });
      }

      return updated;
    } catch (error) {
      if (error instanceof BusinessException) throw error;
      
      throw createBusinessException({
        code: 'PROJECT_UPDATE_ERROR',
        message: 'Failed to update project',
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
        statusCode: 500,
      });
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      if (!Types.ObjectId.isValid(id)) {
        throw createBusinessException({
          code: 'INVALID_ID',
          message: 'Invalid project ID format',
          statusCode: 400,
        });
      }
      
      const result = await Project.deleteOne({ _id: id });
      
      if (result.deletedCount === 0) {
        throw createBusinessException({
          code: 'PROJECT_NOT_FOUND',
          message: 'Project not found',
          statusCode: 404,
        });
      }
      
      return true;
    } catch (error) {
      if (error instanceof BusinessException) throw error;
      
      throw createBusinessException({
        code: 'PROJECT_DELETION_ERROR',
        message: 'Failed to delete project',
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
        statusCode: 500,
      });
    }
  }
}

export default ProjectService
