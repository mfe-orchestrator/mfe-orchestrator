import { FastifyInstance } from 'fastify';
import MicrofrontendDTO from '../types/MicrofrontendDTO';
import MicrofrontendService from '../service/MicrofrontendService';

export default async function microfrontendController(fastify: FastifyInstance) {

  fastify.get<{ Querystring: {
    environment?: string;
  } }>('/microfrontends', async (request, reply) => {
    const { environment } = request.query;
    const microfrontends = environment 
      ? await new MicrofrontendService(request.databaseUser).getByEnvironment(environment)
      : await new MicrofrontendService(request.databaseUser).getAll();
    return reply.send(microfrontends);
  });

  fastify.get<{ Params: {
    id: string;
  } }>('/microfrontends/:id', async (request, reply) => {
    return reply.send(await new MicrofrontendService(request.databaseUser).getById(request.params.id));
  });
  

  fastify.post<{ Body: MicrofrontendDTO, Querystring: {
    environment: string;
  } }>('/microfrontends', async (request, reply) => {
    return reply.send(await new MicrofrontendService(request.databaseUser).create(request.body, request.query.environment));
  });

  fastify.put<{ Params: { id: string }; Body: MicrofrontendDTO }>('/microfrontends/:id', async (request, reply) => {
    return reply.send(await new MicrofrontendService(request.databaseUser).update(
      request.params.id,
      request.body
    ));
  });

  fastify.delete<{ Params: { id: string } }>('/microfrontends/:id', async (request, reply) => {
    return reply.send(await new MicrofrontendService(request.databaseUser).delete(request.params.id));
  });

  fastify.delete<{ Body: string[]  }>('/microfrontends', async (request, reply) => {
    return reply.send({
      message: 'Microfrontends deleted successfully',
      deletedCount: await new MicrofrontendService(request.databaseUser).bulkDelete(request.body)
    });
  });
}