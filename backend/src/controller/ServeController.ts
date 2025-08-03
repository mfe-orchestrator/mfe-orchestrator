import { FastifyInstance } from 'fastify';
import ServeService from '../service/ServeService';

export default async function serveController(fastify: FastifyInstance) {

  const serveService = new ServeService();

  fastify.get<{
    Params: {
      environmentId: string;
    }
  }>('/serve/all/:environmentId', { config: { public: true} }, async (request, reply) => {
    return reply.send(await serveService.getAllByEnvironmentId(request.params.environmentId));
  });

  fastify.get<{
    Params: {
      projectId: string;
      environmentSlug: string;
    }
  }>('/serve/all/:projectId/:environmentSlug', { config: { public: true} }, async (request, reply) => {
    return reply.send(await serveService.getAllByProjectIdAndEnvironmentSlug(request.params.projectId, request.params.environmentSlug));
  });

  fastify.get<{
    Params: {
      environmentSlug: string;
      projectId: string;
      microfrontendSlug: string;
    }
  }>('/serve/mfe/:environmentSlug/:projectId/:microfrontendSlug', { config: { public: true} }, async (request, reply) => {
    return reply.send(await serveService.getByEnvironmentSlugAndProjectIdAndMicrofrontendSlug(request.params.environmentSlug, request.params.projectId, request.params.microfrontendSlug));
  });

  fastify.get<{
    Params: {
      mfeId: string;
    }
  }>('/serve/mfe/:mfeId', { config: { public: true} }, async (request, reply) => {
    return reply.send(await serveService.getMicrofrontendByMicrofrontendId(request.params.mfeId));
  });

  fastify.get<{
    Params: {
      projectId: string;
      environmentSlug: string;
    }
  }>('/serve/mfe/:projectId/:environmentSlug', { config: { public: true} }, async (request, reply) => {
    return reply.send(await serveService.getMicrofrontendByProjectIdAndEnvironmentSlug(request.params.projectId, request.params.environmentSlug));
  });

  fastify.get<{
    Params: {
      environmentId: string;
    }
  }>('/serve/global-variables/:environmentId', { config: { public: true} }, async (request, reply) => {
    return reply.send(await serveService.getGlobalVariablesByEnvironmentId(request.params.environmentId));
  });

  fastify.get<{
    Params:{
      projectId: string;
      environmentSlug: string;
    }
  }>('/serve/global-variables/:projectId/:environmentSlug', { config: { public: true} }, async (request, reply) => {
    return reply.send(await serveService.getGlobalVariablesByProjectIdAndEnvironmentSlug(request.params.projectId, request.params.environmentSlug));
  });

  
}