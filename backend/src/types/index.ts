import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { User } from '../models/UserModel';

export interface IUser {
  _id: string;
  email: string;
  password: string;
  name: string;
  surname: string;
  salt: string;
  resetPasswordToken: string;
  resetPasswordExpires: Date;
  createdAt: Date;
  updatedAt: Date;
  comparePassword: (password: string) => Promise<boolean>;
}

export interface FastifyConfig {
  EMAIL_HOST: string;
  EMAIL_PORT: number;
  EMAIL_SECURE: boolean;
  EMAIL_USER: string;
  EMAIL_PASS: string;
  EMAIL_FROM: string;
  FRONTEND_URL: string;
}

export interface FastifyInstanceWithConfig extends FastifyInstance {
  config: FastifyConfig;
  jwt: any;
  authenticate: any;
}

export interface FastifyRequestWithUser extends FastifyRequest {
  user: IUser;
}

export interface FastifyReplyWithSend extends FastifyReply {
  send: (data: any) => FastifyReply;
  status: (code: number) => FastifyReply;
}
