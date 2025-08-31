import {  FastifyInstance, FastifyReply } from "fastify"
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
            environmentId: string
        }
    }>("/serve/global-variables/:environmentId", { config: { authMethod: AuthenticationMethod.PUBLIC } }, async (request, reply) => {
        return reply.send(await serveService.getGlobalVariablesByEnvironmentId(request.params.environmentId))
    })

    fastify.get<{
        Params: {
            environmentId: string
        }
    }>("/serve/global-variables/:environmentId/index.js", { config: { authMethod: AuthenticationMethod.PUBLIC } }, async (request, reply) => {
        reply.header('Content-Type', 'application/javascript');
        return reply.send(await serveService.getGlobalVariablesByEnvironmentIdFile(request.params.environmentId))
    })

    fastify.get<{
        Params: {
            projectId: string
            environmentSlug: string
        }
    }>("/serve/global-variables/:projectId/:environmentSlug", { config: { authMethod: AuthenticationMethod.PUBLIC } }, async (request, reply) => {
        return reply.send(await serveService.getGlobalVariablesByProjectIdAndEnvironmentSlug(request.params.projectId, request.params.environmentSlug))
    })

    fastify.get<{
        Params: {
            mfeId: string
        }
    }>("/serve/mfe/config/:mfeId", { config: { authMethod: AuthenticationMethod.PUBLIC } }, async (request, reply) => {
        const referer = request.headers.referer;
        if (!referer) {
            throw new Error("Referer not found")
        }
        return reply.send(await serveService.getMicrofrontendConfigurationByMicrofrontendId(request.params.mfeId, referer))
    })

    fastify.get<{
        Params: {
            projectId: string
            environmentSlug: string
            mfeSlug: string
        }
    }>("/serve/mfe/config/:projectId/:environmentSlug/:mfeSlug", { config: { authMethod: AuthenticationMethod.PUBLIC } }, async (request, reply) => {
        return reply.send(await serveService.getMicrofrontendConfigurationByProjectIdEnvironmentSlugAndMfeSlug(request.params.projectId, request.params.environmentSlug, request.params.mfeSlug))
    })

    fastify.get<{
        Params: {
            environmentId: string
            mfeSlug: string
        }
    }>("/serve/mfe/config/:environmentId/:mfeSlug", { config: { authMethod: AuthenticationMethod.PUBLIC } }, async (request, reply) => {
        return reply.send(await serveService.getMicrofrontendConfigurationByEnvironmentIdAndMfeSlug(request.params.environmentId, request.params.mfeSlug))
    })

    fastify.get<{
        Params: {
            projectId: string
            environmentSlug: string
            mfeSlug: string
            '*': string
        }
    }>("/serve/mfe/files/:projectId/:environmentSlug/:mfeSlug/*", { config: { authMethod: AuthenticationMethod.PUBLIC } }, async (request, reply) => {
        const filePath = request.params['*'] || ''
        addHeaderfFromFilePath(filePath, reply)
        return reply.send(await serveService.getByEnvironmentSlugAndProjectIdAndMicrofrontendSlug(request.params.environmentSlug, request.params.projectId, request.params.mfeSlug, filePath))
    })

    fastify.get<{
        Params: {
            mfeId: string
            '*': string
        }
    }>("/serve/mfe/files/:mfeId/*", { config: { authMethod: AuthenticationMethod.PUBLIC } }, async (request, reply) => {
        const referer = request.headers.referer;
        if (!referer) {
            throw new Error("Referer not found")
        }
        const filePath = request.params['*'] || ''
        addHeaderfFromFilePath(filePath, reply)
        return reply.send(await serveService.getMicrofrontendFilesByMicrofrontendId(request.params.mfeId, filePath, referer))
    })

    fastify.get<{
        Params: {
            projectId: string
            mfeSlug: string
            '*': string
        }
    }>("/serve/mfe/files/:projectId/:mfeSlug/*", { config: { authMethod: AuthenticationMethod.PUBLIC } }, async (request, reply) => {
        const referer = request.headers.referer;
        if (!referer) {
            throw new Error("Referer not found")
        }
        const filePath = request.params['*'] || ''
        addHeaderfFromFilePath(filePath, reply)
        return reply.send(await serveService.getMicrofrontendFilesByProjectIdAndMicrofrontendSlug(request.params.projectId, request.params.mfeSlug, filePath, referer))
    })

    function addHeaderfFromFilePath(filePath: string, reply: FastifyReply){
        if (filePath.endsWith('.js')) {
            reply.header('Content-Type', 'application/javascript');
        }
    }

    

    
}
