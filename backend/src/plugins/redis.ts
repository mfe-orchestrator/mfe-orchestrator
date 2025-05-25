import fastifyPlugin from 'fastify-plugin';
import { FastifyInstance } from 'fastify';
import { createClient, RedisClientType } from '@redis/client';

export let redisClient: RedisClientType;

export default fastifyPlugin(
  async (fastify: FastifyInstance) => {
    try {
      redisClient = createClient({
        url: fastify.config.REDIS_URL,
        password: fastify.config.REDIS_PASSWORD,
        username: 'default',
      });

      await redisClient.connect();

      fastify.decorate('redis', redisClient);

      fastify.addHook('onClose', async () => {
        await redisClient.disconnect();
      });
    } catch (exception) {
      console.error('Error starting Redis');
      console.error(exception);
    }
  },
  { dependencies: ['config'] }
);
