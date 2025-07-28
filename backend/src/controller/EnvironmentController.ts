import { FastifyInstance } from 'fastify';
import EnvironmentService from '../service/EnvironmentService';
import { EnvironmentDTO } from '../types/EnvironmentDTO';

export default async function environmentController(fastify: FastifyInstance) {

  const environmentService = new EnvironmentService();
  
  
  fastify.get<{
    Params: {
      slug: string;
    }
  }>('/environments/by-slug/:slug', async (request, reply) => {
    return reply.send(await environmentService.getBySlug(request.params.slug));
  });

  fastify.get<{
    Params: {
      id: string;
    }
  }>('/environments/:id', async (request, reply) => {
    return reply.send(await environmentService.getById(request.params.id));
  });

  fastify.post<{
    Body: EnvironmentDTO
  }>('/environments', async (request, reply) => {
    return reply.send(await environmentService.create(request.body));
  });

  fastify.put<{
    Body: EnvironmentDTO
    Params: {
      id: string;
    }
  }>('/environments/:id', async (request, reply) => {
    return reply.send(await environmentService.update(request.params.id, request.body));
  });


  fastify.delete<{
    Params: {
      id: string;
    }
  }>('/environments/:id', async (request, reply) => {
    reply.send(await environmentService.deleteSingle(request.params.id));
  });

  fastify.delete<{
    Body: string[]
  }>('/environments', async (request, reply) => {
    return reply.send(await environmentService.deleteMultiple(request.body));
  });
}