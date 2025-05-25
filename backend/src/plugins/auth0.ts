import { FastifyInstance } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import fastifyAuth0Verify, { FastifyAuth0VerifyOptions } from 'fastify-auth0-verify';

export default fastifyPlugin(async (fastify: FastifyInstance) => {
    if(!fastify.config.AUTH0_DOMAIN) return;

    fastify.register(fastifyAuth0Verify, {
      domain: fastify.config.AUTH0_DOMAIN,
      client_id: fastify.config.AUTH0_CLIENT_ID,
      client_secret: fastify.config.AUTH0_SECRET,
      audience: fastify.config.AUTH0_API_AUDIENCE,
    } as FastifyAuth0VerifyOptions);
  },
  { name: 'auth0', dependencies: ['config'] }
);
