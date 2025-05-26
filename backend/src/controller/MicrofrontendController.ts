import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { MicrofrontendService } from '../services/MicrofrontendService';
import { EnvironmentService } from '../service/EnvironmentService';

export default async function microfrontendController(fastify: FastifyInstance) {
  const microfrontendService = new MicrofrontendService();
  const environmentService = new EnvironmentService();

  fastify.post('/microfrontends', async (request: FastifyRequest<{ Body: Microfrontend }>, reply: FastifyReply) => {
    try {
      const microfrontend = await microfrontendService.create(request.body);
      return reply.status(201).send(microfrontend);
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to create microfrontend' });
    }
  });

  fastify.get('/microfrontends/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const microfrontend = await microfrontendService.getById(request.params.id);
      return reply.send(microfrontend);
    } catch (error) {
      return reply.status(404).send({ error: 'Microfrontend not found' });
    }
  });

  fastify.get('/microfrontends', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const microfrontends = await microfrontendService.getAll();
      return reply.send(microfrontends);
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to fetch microfrontends' });
    }
  });

  fastify.put('/microfrontends/:id', async (request: FastifyRequest<{ Params: { id: string }; Body: Partial<Microfrontend> }>, reply: FastifyReply) => {
    try {
      const updatedMicrofrontend = await microfrontendService.update(
        request.params.id,
        request.body
      );
      return reply.send(updatedMicrofrontend);
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to update microfrontend' });
    }
  });

  fastify.post('/microfrontends/:id/deploy', async (request: FastifyRequest<{ Params: { id: string }; Body: { environmentId: string } }>, reply: FastifyReply) => {
    try {
      await microfrontendService.deploy(request.params.id, request.body.environmentId);
      return reply.send({ message: 'Deployment successful' });
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to deploy microfrontend' });
    }
  });
}