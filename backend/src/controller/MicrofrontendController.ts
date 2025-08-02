import { FastifyInstance } from 'fastify';
import MicrofrontendDTO from '../types/MicrofrontendDTO';
import MicrofrontendService from '../service/MicrofrontendService';
import { getEnvironmentIdFromRequest } from '../utils/requestUtils';
import EnvironmentHeaderNotFoundError from '../errors/EnvironmentHeaderNotFoundError';

export default async function microfrontendController(fastify: FastifyInstance) {

  fastify.get('/microfrontends', async (request, reply) => {
    const environmentId = getEnvironmentIdFromRequest(request);
    if(!environmentId){
      throw new EnvironmentHeaderNotFoundError();
    }
    return reply.send(await new MicrofrontendService(request.databaseUser).getByEnvironmentId(environmentId));
  });

  fastify.get<{ Params: {
    id: string;
  } }>('/microfrontends/:id', async (request, reply) => {
    return reply.send(await new MicrofrontendService(request.databaseUser).getById(request.params.id));
  });
  

  fastify.post<{ Body: MicrofrontendDTO, Querystring: {
    environment: string;
  } }>('/microfrontends', async (request, reply) => {
    const environmentId = getEnvironmentIdFromRequest(request);
    if(!environmentId){
      throw new EnvironmentHeaderNotFoundError();
    }
    return reply.send(await new MicrofrontendService(request.databaseUser).create(request.body, environmentId));
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