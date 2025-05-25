import { FastifyInstance } from 'fastify';
import { name, version } from '../../package.json';

export default async function echoController(fastify: FastifyInstance) {
  fastify.get('/echo', async (request, reply) => {
    return {
      name: name,
      version: version,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'prod',
    };
  });
}