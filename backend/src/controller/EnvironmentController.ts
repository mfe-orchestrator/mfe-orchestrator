import { FastifyInstance } from 'fastify';
import EnvironmentService from '../service/EnvironmentService';
import { EnvironmentDTO } from '../types/EnvironmentDTO';
import { getProjectIdFromRequest } from '../utils/requestUtils';
import ProjectHeaderNotFoundError from '../errors/ProjectHeaderNotFoundError';

export default async function environmentController(fastify: FastifyInstance) {

  fastify.get('/environments', async (request, reply) => {
    const projectId = getProjectIdFromRequest(request);
    if (!projectId) {
      throw new ProjectHeaderNotFoundError();
    }

    const environments = await new EnvironmentService(request.databaseUser).getByProjectId(projectId);
    return reply.send(environments);
  });

  fastify.post<{ Body: EnvironmentDTO }>(
    '/environments',
    async (request, reply) => {
      const projectId = getProjectIdFromRequest(request);
      if (!projectId) {
        throw new ProjectHeaderNotFoundError();
      }

      const environment = await new EnvironmentService(request.databaseUser).create(request.body, projectId);
      return reply.send(environment);
    }
  );

  fastify.post<{ Body: EnvironmentDTO[] }>(
    '/environments/bulk',
    async (request, reply) => {
      const projectId = getProjectIdFromRequest(request);
      if (!projectId) {
        throw new ProjectHeaderNotFoundError();
      }
      return reply.send(await new EnvironmentService(request.databaseUser).createBulk(request.body, projectId));
    }
  );

  fastify.put<{ Body: EnvironmentDTO; Params: { id: string } }>(
    '/environments/:id',
    async (request, reply) => {
      const environment = await new EnvironmentService(request.databaseUser).update(
        request.params.id,
        request.body
      );
      return reply.send(environment);
    }
  );

  fastify.delete<{ Params: { id: string } }>(
    '/environments/:id',
    async (request, reply) => {
      await new EnvironmentService(request.databaseUser).deleteSingle(request.params.id);
      return reply.send();
    }
  );

  fastify.delete<{ Body: string[] }>(
    '/environments',
    async (request, reply) => {
      const result = await new EnvironmentService(request.databaseUser).deleteMultiple(request.body);
      return reply.send(result);
    }
  );
}