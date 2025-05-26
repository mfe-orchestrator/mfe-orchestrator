import { FastifyInstance } from 'fastify';
import { MicrofrontendService } from '../service/MicrofrontendService';
import { Microfrontend } from '../models/MicrofrontendModel';
import MicrofrontendDTO from '../types/MicrofrontendDTO';

export default async function microfrontendController(fastify: FastifyInstance) {
  const microfrontendService = new MicrofrontendService(Microfrontend);

  fastify.get<{ Querystring: {
    environment?: string;
  } }>('/microfrontends', async (request, reply) => {
    const { environment } = request.query;
    const microfrontends = environment 
      ? await microfrontendService.getByEnvironment(environment)
      : await microfrontendService.getAll();
    return reply.send(microfrontends);
  });

  fastify.get<{ Params: {
    id: string;
  } }>('/microfrontends/:id', async (request, reply) => {
    return reply.send(await microfrontendService.getById(request.params.id));
  });
  

  fastify.post<{ Body: MicrofrontendDTO, Querystring: {
    environment: string;
  } }>('/microfrontends', async (request, reply) => {
    return reply.send(await microfrontendService.create(request.body, request.query.environment));
  });

  fastify.put<{ Params: { id: string }; Body: MicrofrontendDTO }>('/microfrontends/:id', async (request, reply) => {
    return reply.send(await microfrontendService.update(
      request.params.id,
      request.body
    ));
  });

  fastify.delete<{ Params: { id: string } }>('/microfrontends/:id', async (request, reply) => {
    return reply.send(await microfrontendService.delete(request.params.id));
  });

  fastify.delete<{ Body: string[]  }>('/microfrontends', async (request, reply) => {
    return reply.send({
      message: 'Microfrontends deleted successfully',
      deletedCount: await microfrontendService.bulkDelete(request.body)
    });
  });
}