import { FastifyInstance } from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import fastifyPlugin from 'fastify-plugin';

export default fastifyPlugin(
  async (fastify: FastifyInstance) => {
    await fastify.register(fastifyMultipart);
  },
  { name: 'multipart' }
);
