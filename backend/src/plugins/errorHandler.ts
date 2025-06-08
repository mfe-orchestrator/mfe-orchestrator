import { FastifyInstance, FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import { BusinessException } from '../errors/BusinessException';

// Define custom error types
interface CustomError extends Error {
  statusCode?: number;
  code?: string;
  details?: Record<string, unknown>;
  type?: string;
  grants?: string[];
}

interface AxiosError extends Error {
  response?: {
    data: unknown;
    status: number;
  };
  request?: {
    method: string;
    host: string;
    path: string;
  };
}

function isAuthenticationError(error: unknown): error is CustomError {
  return error instanceof Error && (error as CustomError)?.type === 'AuthenticationError';
}

function isAuthorizationError(error: unknown): error is CustomError & { grants: string[] } {
  return error instanceof Error && (error as CustomError)?.type === 'AuthorizationError';
}

function isAxiosError(error: unknown): error is AxiosError {
  return error instanceof Error && (error as any)?.isAxiosError === true;
}

function isBusinessException(error: unknown): error is BusinessException {
  return error instanceof BusinessException;
}

export default fastifyPlugin(
  async (fastify: FastifyInstance) => {
    fastify.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
      if (isAxiosError(error as AxiosError)) {
        const axiosError = error as AxiosError;
        return reply.code(400).send({
          message: error.message,
          response: axiosError.response ? {
            data: axiosError.response.data,
            status: axiosError.response.status,
          } : undefined,
          request: axiosError.request ? {
            method: axiosError.request.method,
            host: axiosError.request.host,
            path: axiosError.request.path,
          } : undefined,
          timestamp: new Date().toISOString(),
        });
      }

      if (isAuthenticationError(error as CustomError)) {
        const authError = error as CustomError;
        fastify.log.error('Authentication error: ' + authError.message, authError);
        return reply.code(401).send({
          success: false,
          error: {
            code: 'AUTHENTICATION_ERROR',
            message: authError.message,
          },
          timestamp: new Date().toISOString(),
        });
      }

      if (isBusinessException(error)) {
        return reply.code(error.statusCode).send({
          success: false,
          error: {
            code: error.code,
            message: error.message,
            ...(error.details && { details: error.details }),
          },
          timestamp: new Date().toISOString(),
        });
      }

      if (isAuthorizationError(error)) {
        const authzError = error as CustomError & { grants: string[] };
        return reply.code(403).send({
          success: false,
          error: {
            code: 'AUTHORIZATION_ERROR',
            message: authzError.message,
            ...(authzError.grants && { requiredGrants: authzError.grants }),
          },
          status: 403,
        });
      }

      fastify.log.error(error);

      throw error;
    });
  },
  { name: 'errorHandler' }
);
