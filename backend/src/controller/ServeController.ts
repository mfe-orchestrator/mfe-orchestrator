import {  FastifyInstance } from "fastify"
import ServeService from "../service/ServeService"
import AuthenticationMethod from "../types/AuthenticationMethod"

export default async function serveController(fastify: FastifyInstance) {
    const serveService = new ServeService()

    fastify.get<{
        Params: {
            environmentId: string
        }
    }>("/serve/all/:environmentId", { config: { authMethod: AuthenticationMethod.PUBLIC } }, async (request, reply) => {
        return reply.send(await serveService.getAllByEnvironmentId(request.params.environmentId))
    })

    fastify.get<{
        Params: {
            projectId: string
            environmentSlug: string
        }
    }>("/serve/all/:projectId/:environmentSlug", { config: { authMethod: AuthenticationMethod.PUBLIC } }, async (request, reply) => {
        return reply.send(await serveService.getAllByProjectIdAndEnvironmentSlug(request.params.projectId, request.params.environmentSlug))
    })

    fastify.get<{
        Params: {
            environmentSlug: string
            projectId: string
            microfrontendSlug: string
            '*': string  // This captures the rest of the path
        }
    }>("/serve/mfe/:environmentSlug/:projectId/:microfrontendSlug/*", { config: { authMethod: AuthenticationMethod.PUBLIC } }, async (request, reply) => {
        const filePath = request.params['*'] || ''
        if (filePath.endsWith('.js')) {
            reply.header('Content-Type', 'application/javascript');
        }
        return reply.send(await serveService.getByEnvironmentSlugAndProjectIdAndMicrofrontendSlug(request.params.environmentSlug, request.params.projectId, request.params.microfrontendSlug, filePath))
    })

    fastify.get<{
        Params: {
            mfeId: string
        }
    }>("/serve/mfe/:mfeId", { config: { authMethod: AuthenticationMethod.PUBLIC } }, async (request, reply) => {
        return reply.send(await serveService.getMicrofrontendByMicrofrontendId(request.params.mfeId))
    })

    fastify.get<{
        Params: {
            projectId: string
            environmentSlug: string
        }
    }>("/serve/mfe/:projectId/:environmentSlug", { config: { authMethod: AuthenticationMethod.PUBLIC } }, async (request, reply) => {
        return reply.send(await serveService.getMicrofrontendByProjectIdAndEnvironmentSlug(request.params.projectId, request.params.environmentSlug))
    })

    fastify.get<{
        Params: {
            environmentId: string
        }
    }>("/serve/global-variables/:environmentId", { config: { authMethod: AuthenticationMethod.PUBLIC } }, async (request, reply) => {
        return reply.send(await serveService.getGlobalVariablesByEnvironmentId(request.params.environmentId))
    })

    fastify.get<{
        Params: {
            projectId: string
            environmentSlug: string
        }
    }>("/serve/global-variables/:projectId/:environmentSlug", { config: { authMethod: AuthenticationMethod.PUBLIC } }, async (request, reply) => {
        return reply.send(await serveService.getGlobalVariablesByProjectIdAndEnvironmentSlug(request.params.projectId, request.params.environmentSlug))
    })
}
