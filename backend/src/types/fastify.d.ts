import { Authenticate } from 'fastify-auth0-verify';
import { RedisClientType, RedisFunctions, RedisModules, RedisScripts } from '@redis/client';
import { FastifyRequest, FastifyReply } from 'fastify';
import { FastifyMultipartFile } from '@fastify/multipart';
import { FastifyInstance } from 'fastify';
import { FastifyInstanceWithConfig } from './index';
import UserModel from '../models/UserModel';

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
    config: {
      PORT: number;
      NOSQL_DATABASE_URL: string;
      NOSQL_DATABASE_USERNAME: string;
      NOSQL_DATABASE_PASSWORD: string;
      NOSQL_DATABASE_NAME: string;
      AUTH0_DOMAIN: string;
      AUTH0_CLIENT_ID: string;
      AUTH0_AUDIENCE: string;
      AUTH0_SCOPE: string;
      ALLOWED_ORIGINS: string;
      REGISTRATION_ALLOWED: boolean;
      ALLOW_EMBEDDED_LOGIN: boolean;
      REDIS_URL: string;
      REDIS_PASSWORD: string;
      EMAIL_SMTP_HOST: string;
      EMAIL_SMTP_PORT: number;
      EMAIL_SMTP_SECURE: boolean;
      EMAIL_SMTP_USER: string;
      EMAIL_SMTP_PASSWORD: string;
      EMAIL_SMTP_FROM: string;
      FRONTEND_URL: string;
      HOST: string;
      NODE_ENV: string;
      AZURE_ENTRAID_TENANT_ID: string;
      AZURE_ENTRAID_CLIENT_ID: string;
      AZURE_ENTRAID_REDIRECT_URI: string;
      AZURE_ENTRAID_AUTHORITY: string;
      AZURE_ENTRAID_SCOPES: string;
      AZURE_ENTRAID_API_AUDIENCE: string;
      GOOGLE_CLIENT_ID: string;
      GOOGLE_REDIRECT_URI: string;
      GOOGLE_AUTH_SCOPE: string;
      GOOGLE_AUTH_HOSTED_DOMAIN: string;
      GOOGLE_API_AUDIENCE: string;
      MICROFRONTEND_HOST_FOLDER: string;
      RECAPTCHA_SECRET_KEY: string;
      BREVO_API_KEY: string;
      BREVO_LIST_ID: string;
    };
  }

  interface FastifyRequest {
    databaseUser: UserModel;
  }

  interface FastifyContextConfig {
    grants?: string[];
    public?: boolean;
  }
}

export type AppInstance = FastifyInstance;