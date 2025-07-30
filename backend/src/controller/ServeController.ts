import { FastifyInstance } from 'fastify';

export default async function serveController(fastify: FastifyInstance) {

  fastify.get('/serve', async (request, reply) => {
    return reply.send('Hello World');
  });
}