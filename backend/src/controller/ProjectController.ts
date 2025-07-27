import { FastifyInstance } from 'fastify';
import { ProjectCreateInput } from '../service/ProjectService';
import ProjectService from '../service/ProjectService';

export default async function projectController(fastify: FastifyInstance) {

  const projectService = new ProjectService();
  
  // Get all projects
  fastify.get('/projects', async (request, reply) => {
    try {
      const projects = await projectService.findAll();
      return reply.send({ success: true, data: projects });
    } catch (error) {
      // Error is already a BusinessException from the service
      throw error;
    }
  });

  fastify.get('/projects/mine', async (request, reply) => {
    try {
      const projects = await projectService.findAll();
      return reply.send({ success: true, data: projects });
    } catch (error) {
      // Error is already a BusinessException from the service
      throw error;
    }
  });

  // Get project by ID
  fastify.get<{
    Params: {
      id: string;
    }
  }>('/projects/:id', async (request, reply) => {
    try {
      const project = await projectService.findById(request.params.id);
      if (!project) {
        throw new Error('Project not found'); // This will be caught and converted to 500, but should be handled by service
      }
      return reply.send({ success: true, data: project });
    } catch (error) {
      // Error is already a BusinessException from the service
      throw error;
    }
  });

  // Create new project
  fastify.post<{
    Body: ProjectCreateInput;
  }>('/projects', async (request, reply) => {
    try {
      const project = await projectService.create(request.body);
      return reply.status(201).send({ success: true, data: project });
    } catch (error) {
      // Error is already a BusinessException from the service
      throw error;
    }
  });

  // Update project
  fastify.put<{
    Body: Partial<ProjectCreateInput> & { description?: string | null };
    Params: {
      id: string;
    }
  }>('/projects/:id', async (request, reply) => {
    try {
      const project = await projectService.update(request.params.id, request.body);
      return reply.send({ success: true, data: project });
    } catch (error) {
      // Error is already a BusinessException from the service
      throw error;
    }
  });

  // Delete project
  fastify.delete<{
    Params: {
      id: string;
    }
  }>('/projects/:id', async (request, reply) => {
    try {
      await projectService.delete(request.params.id);
      return reply.status(204).send();
    } catch (error) {
      // Error is already a BusinessException from the service
      throw error;
    }
  });
}
