import { FastifyInstance } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import AuthenticationError from '../errors/AuthenticationError';
import AuthorizationError from '../errors/AuthorizationError';
import { AxiosError } from 'axios';

function isAuthenticationError(error: unknown): error is AuthenticationError {
  return error instanceof Error && (error as any)?.type === 'AuthenticationError';
}

function isAuthorizationError(error: unknown): error is AuthorizationError {
  return error instanceof Error && (error as any)?.type === 'AuthorizationError';
}

function isAxiosError(error: unknown): error is AxiosError {
  return error instanceof Error && (error as any)?.name === 'AxiosError';
}

export default fastifyPlugin(
  async (fastify: FastifyInstance) => {
    fastify.setErrorHandler((error, request, reply) => {
      if (isAxiosError(error)) {
        return reply.code(400).send({
          message: error.message,
          response: {
            data: error.response?.data,
            status: error.response?.status,
          },
          request: {
            method: error.request.method,
            host: error.request.host,
            path: error.request.path,
          },
          timestamp: new Date().toISOString(),
        });
      }

      if (isAuthenticationError(error)) {
        fastify.log.error('Authentication error: ' + error.message, error);
        return reply.code(401).send({
          message: error.message,
          status: 401,
          timestamp: new Date().toISOString(),
        });
      }

      if (isAuthorizationError(error)) {
        return reply.code(403).send({
          message: error.message,
          requiredGrants: error.grants,
          userGrants: request.databaseUser.grants,
          status: 403,
          timestamp: new Date().toISOString(),
        });
      }

      fastify.log.error(error);

      throw error;
    });
  },
  { name: 'errorHandler' }
);
