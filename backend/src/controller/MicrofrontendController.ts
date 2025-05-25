import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Microfrontend } from '../models/MicrofrontendModel';
import { MicrofrontendService } from '../services/MicrofrontendService';
import { Environment } from '../models/EnvironmentModel';
import { EnvironmentService } from '../services/EnvironmentService';

export class MicrofrontendController {
  constructor(private readonly microfrontendService: MicrofrontendService, private readonly environmentService: EnvironmentService) {}

  async create(
    request: FastifyRequest<{ Body: Microfrontend }>,
    reply: FastifyReply
  ) {
    try {
      const microfrontend = await this.microfrontendService.create(request.body);
      reply.status(201).send(microfrontend);
    } catch (error) {
      reply.status(500).send({ error: 'Failed to create microfrontend' });
    }
  }

  async getById(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    try {
      const microfrontend = await this.microfrontendService.getById(request.params.id);
      if (!microfrontend) {
        reply.status(404).send({ error: 'Microfrontend not found' });
      } else {
        reply.status(200).send(microfrontend);
      }
    } catch (error) {
      reply.status(500).send({ error: 'Failed to get microfrontend' });
    }
  }

  async getAll(request: FastifyRequest, reply: FastifyReply) {
    try {
      const microfrontends = await this.microfrontendService.getAll();
      reply.status(200).send(microfrontends);
    } catch (error) {
      reply.status(500).send({ error: 'Failed to get microfrontends' });
    }
  }

  async update(
    request: FastifyRequest<{ Params: { id: string }; Body: Partial<Microfrontend> }>,
    reply: FastifyReply
  ) {
    try {
      const updatedMicrofrontend = await this.microfrontendService.update(
        request.params.id,
        request.body
      );
      if (!updatedMicrofrontend) {
        reply.status(404).send({ error: 'Microfrontend not found' });
      } else {
        reply.status(200).send(updatedMicrofrontend);
      }
    } catch (error) {
      reply.status(500).send({ error: 'Failed to update microfrontend' });
    }
  }

  async delete(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    try {
      const deleted = await this.microfrontendService.delete(request.params.id);
      if (!deleted) {
        reply.status(404).send({ error: 'Microfrontend not found' });
      } else {
        reply.status(204).send();
      }
    } catch (error) {
      reply.status(500).send({ error: 'Failed to delete microfrontend' });
    }
  }

  async deploy(
    request: FastifyRequest<{ Params: { id: string }; Body: { environmentId: string } }>,
    reply: FastifyReply
  ) {
    try {
      const { environmentId } = request.body;
      const microfrontendId = request.params.id;

      // Check if microfrontend exists
      const microfrontend = await this.microfrontendService.getById(microfrontendId);
      if (!microfrontend) {
        return reply.status(404).send({ error: 'Microfrontend not found' });
      }

      // Check if target environment exists
      const environment = await this.environmentService.getById(environmentId);
      if (!environment) {
        return reply.status(404).send({ error: 'Target environment not found' });
      }

      // Create a new microfrontend with the same properties but different environment
      const newMicrofrontend = {
        ...microfrontend,
        environment: environmentId,
        slug: `${microfrontend.slug}-${environment.slug}`,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Save the new microfrontend
      const savedMicrofrontend = await this.microfrontendService.create(newMicrofrontend);

      reply.status(201).send({
        message: 'Microfrontend deployed successfully',
        deployedMicrofrontend: savedMicrofrontend
      });
    } catch (error) {
      reply.status(500).send({ error: 'Failed to deploy microfrontend' });
    }
  }
}