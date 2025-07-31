import { FastifyInstance } from 'fastify';
import { ProjectCreateInput } from '../service/ProjectService';
import ProjectService from '../service/ProjectService';
import EnvironmentService from '../service/EnvironmentService';

export default async function projectController(fastify: FastifyInstance) {
 
  fastify.get('/projects/mine', async (request, reply) => {
    const projects = await new ProjectService(request.databaseUser).findMine(request.databaseUser._id);
    return reply.send(projects);  
  });

  // Get project by ID
  fastify.get<{
    Params: {
      id: string;
    }
  }>('/projects/:id', async (request, reply) => {
    const project = await new ProjectService(request.databaseUser).findById(request.params.id);
    return reply.send(project);
  });

  // Get project by ID
  fastify.get<{
    Params: {
      projectId: string;
    }
  }>('/projects/:projectId/environments', async (request, reply) => {
    const environments = await new EnvironmentService(request.databaseUser).getByProjectId(request.params.projectId);
    return reply.send(environments);
  });

  // Create new project
  fastify.post<{
    Body: ProjectCreateInput;
  }>('/projects', async (request, reply) => {
    const project = await new ProjectService(request.databaseUser).create(request.body, request.databaseUser._id);
    return reply.status(201).send(project);
  });

  // Update project
  fastify.put<{
    Body: Partial<ProjectCreateInput> & { description?: string | null };
    Params: {
      id: string;
    }
  }>('/projects/:id', async (request, reply) => {
    const project = await new ProjectService(request.databaseUser).update(request.params.id, request.body);
    return reply.send({ success: true, data: project });
  });

  // Delete project
  fastify.delete<{
    Params: {
      id: string;
    }
  }>('/projects/:id', async (request, reply) => {
    await new ProjectService(request.databaseUser).delete(request.params.id);
    return reply.status(204).send();
  });
}
