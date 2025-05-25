import { FastifyInstance } from 'fastify';
import { Environment } from '../models/EnvironmentModel';

export default async function environmentRoutes(fastify: FastifyInstance) {
  // Get all environments
  fastify.get('/environments', async (request, reply) => {
    try {
      const environments = await Environment.find().sort({ createdAt: -1 });
      return reply.code(200).send(environments);
    } catch (error) {
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Get single environment by slug
  fastify.get('/environments/:slug', async (request, reply) => {
    try {
      const { slug } = request.params as { slug: string };
      const environment = await Environment.findOne({ slug });
      if (!environment) {
        return reply.code(404).send({ error: 'Environment not found' });
      }
      return reply.code(200).send(environment);
    } catch (error) {
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Create new environment
  fastify.post('/environments', async (request, reply) => {
    try {
      const { name, description, slug } = request.body as {
        name: string;
        description: string;
        slug: string;
      };

      const environment = new Environment({
        name,
        description,
        slug,
      });

      const savedEnvironment = await environment.save();
      return reply.code(201).send(savedEnvironment);
    } catch (error) {
      if (error.name === 'ValidationError') {
        return reply.code(400).send({ error: error.message });
      }
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Update environment
  fastify.put('/environments/:slug', async (request, reply) => {
    try {
      const { slug } = request.params as { slug: string };
      const { name, description } = request.body as {
        name: string;
        description: string;
      };

      const updatedEnvironment = await Environment.findOneAndUpdate(
        { slug },
        { name, description },
        { new: true }
      );

      if (!updatedEnvironment) {
        return reply.code(404).send({ error: 'Environment not found' });
      }

      return reply.code(200).send(updatedEnvironment);
    } catch (error) {
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Delete single environment
  fastify.delete('/environments/:slug', async (request, reply) => {
    try {
      const { slug } = request.params as { slug: string };
      const deletedEnvironment = await Environment.findOneAndDelete({ slug });

      if (!deletedEnvironment) {
        return reply.code(404).send({ error: 'Environment not found' });
      }

      return reply.code(200).send({ message: 'Environment deleted successfully' });
    } catch (error) {
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Delete multiple environments
  fastify.delete('/environments', async (request, reply) => {
    try {
      const { slugs } = request.body as { slugs: string[] };
      
      if (!slugs || !Array.isArray(slugs) || slugs.length === 0) {
        return reply.code(400).send({ error: 'Slugs array is required' });
      }

      const deletedCount = await Environment.deleteMany({ slug: { $in: slugs } });
      return reply.code(200).send({
        message: 'Environments deleted successfully',
        deletedCount: deletedCount.deletedCount
      });
    } catch (error) {
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });
}