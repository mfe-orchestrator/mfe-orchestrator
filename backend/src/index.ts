import dotenv from 'dotenv';
import Fastify from 'fastify';
import AutoLoad from '@fastify/autoload';
import path from 'path';
import { AppInstance } from './types/fastify';

export const fastify : AppInstance = Fastify({
  logger: true,
});

export async function build() {
  const startPlugins = performance.now();
  await fastify.register(AutoLoad, {
    dir: path.join(__dirname, 'plugins'),
  });
  fastify.log.info(`Plugins ${(performance.now() - startPlugins).toFixed(2)} ms`);

  const startControllers = performance.now();
  await fastify.register(AutoLoad, {
    dir: path.join(__dirname, 'controller'),
  });
  fastify.log.info(`Controllers ${(performance.now() - startControllers).toFixed(2)} ms`);

  return fastify;
}

const start = async () => {
  dotenv.config();

  let fastify;

  const start = performance.now();
  try {
    fastify = await build();
  } catch (e) {
    console.error('Error occured while building fastify');
    console.error(e);
    return;
  }

  fastify.log.info(`Successfully built fastify instance in ${(performance.now() - start).toFixed(2)} ms`);

  await fastify.listen({
    host: '0.0.0.0',
    port: fastify.config.PORT,
  });
};

start();
