import fastifyPlugin from 'fastify-plugin';
import { FastifyInstance } from 'fastify';
import RateLimit from '@fastify/rate-limit'


export default fastifyPlugin(
	async (fastify: FastifyInstance) => {
		await fastify.register(RateLimit, {
            max: 100,
            timeWindow: '1 minute'
        })
        fastify.setNotFoundHandler({
            preHandler: fastify.rateLimit()
          }, function (request, reply) {
            reply.code(404).send()
        })
	},
	{ dependencies: ['config'] },
);
