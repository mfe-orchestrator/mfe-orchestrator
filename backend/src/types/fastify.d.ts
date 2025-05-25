import { Authenticate } from 'fastify-auth0-verify';
import { RedisClientType, RedisFunctions, RedisModules, RedisScripts } from '@redis/client';
import Auth0UserDTO from '../dto/Auth0UserDTO';
import UserDTO from '../dto/UserDTO';

import { FastifyRequest, FastifyReply } from 'fastify';
import { FastifyMultipartFile } from '@fastify/multipart';
import { FastifyInstance } from 'fastify';
import { FastifyInstanceWithConfig } from './index';

export interface FastifyRequestWithConfig extends FastifyRequest {
  config: FastifyInstanceWithConfig['config'];
}

export interface FastifyReplyWithConfig extends FastifyReply {
  config: FastifyInstanceWithConfig['config'];
}

export interface FastifyMultipartRequest extends FastifyRequest {
  file: FastifyMultipartFile;
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: Authenticate;
    redis: RedisClientType<RedisModules, RedisFunctions, RedisScripts>;
    config: {
      PORT: number;
      DATABASE_URL: string;
      AUTH0_DOMAIN: string;
      AUTH0_CLIENT_ID: string;
      AUTH0_SECRET: string;
      AUTH0_API_AUDIENCE: string;
      ALLOWED_ORIGINS: string[];
      REDIS_URL: string;
      REDIS_PASSWORD: string;
      EMAIL_SMTP_HOST: string;
      EMAIL_SMTP_PORT: number;
      EMAIL_SMTP_SECURE: boolean;
      EMAIL_SMTP_USER: string;
      EMAIL_SMTP_PASSWORD: string;
      EMAIL_SMTP_FROM: string;
      FRONTEND_URL: string;
      NOSQL_DB_URL: string;
      NOSQL_DB_DATABASE: string;
      NOSQL_DB_PASSWORD: string;
      HOST: string;
      NODE_ENV: string;
      AZURE_ENTRAID_TENANT_ID: string;
      AZURE_ENTRAID_CLIENT_ID: string;
      AZURE_ENTRAID_CLIENT_SECRET: string;
      AZURE_ENTRAID_REDIRECT_URI: string;
      AZURE_ENTRAID_AUTHORITY: string;
      AZURE_ENTRAID_SCOPES: string;
      AZURE_ENTRAID_API_AUDIENCE: string;
    };
  }

  interface FastifyRequest {
    auth0user: Auth0UserDTO;
    databaseUser: UserDTO;
  }

  interface FastifyContextConfig {
    grants?: string[];
    public?: boolean;
  }
}
