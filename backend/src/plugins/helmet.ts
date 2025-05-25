import { FastifyInstance } from "fastify";
import fastifyPlugin from 'fastify-plugin';
import helmet from '@fastify/helmet';

export default fastifyPlugin(
  async (fastify: FastifyInstance) => {
    fastify.register(helmet, {
      crossOriginResourcePolicy: false,
    });
  },
  {}
);