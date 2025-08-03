import { FastifyInstance } from 'fastify';

export default async function deploymentController(fastify: FastifyInstance) {

    fastify.post('/deployment', async (request, reply) => {
        reply.send("TODO to be implemented")
    });

    fastify.get('/deployment/:deploymentId/canary-users', async (request, reply) => {
        reply.send("TODO to be implemented")
    });

    fastify.post('/deployment/:deploymentId/canary-users', async (request, reply) => {
        reply.send("TODO to be implemented")
    });
}