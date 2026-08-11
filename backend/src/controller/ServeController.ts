import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import ServeService, { isRedirectToVersion, VERSION_PATH_SEGMENT } from "../service/ServeService"
import AuthenticationMethod from "../types/AuthenticationMethod"

export default async function serveController(fastify: FastifyInstance) {
    fastify.get<{
        Querystring: {
            framework: string
            microfrontendId: string
            deploymentId: string
        }
    }>("/serve/code", async (request, reply) => {
        return reply.send(await new ServeService(request, reply).getCodeIntegration(request.query))
    })

    fastify.get<{
        Params: {
            environmentId: string
        }
    }>("/serve/all/:environmentId", { config: { authMethod: AuthenticationMethod.PUBLIC } }, async (request, reply) => {
        return reply.send(await new ServeService(request, reply).getAllByEnvironmentId(request.params.environmentId))
    })

    // Registered before /serve/all/:projectId/:environmentSlug on purpose: `auto` is a static segment and
    // find-my-way gives it precedence over the parametric one anyway, but keeping the more specific route
    // first makes that precedence visible instead of implied.
    fastify.get<{
        Params: {
            projectId: string
        }
    }>("/serve/all/auto/:projectId", { config: { authMethod: AuthenticationMethod.PUBLIC } }, async (request, reply) => {
        return reply.send(await new ServeService(request, reply).getAllByProjectIdAndReferer(request.params.projectId, getReferer(request)))
    })

    fastify.get<{
        Params: {
            projectId: string
            environmentSlug: string
        }
    }>("/serve/all/:projectId/:environmentSlug", { config: { authMethod: AuthenticationMethod.PUBLIC } }, async (request, reply) => {
        return reply.send(await new ServeService(request, reply).getAllByProjectIdAndEnvironmentSlug(request.params.projectId, request.params.environmentSlug))
    })

    fastify.get<{
        Params: {
            environmentId: string
        }
    }>("/serve/global-variables/:environmentId", { config: { authMethod: AuthenticationMethod.PUBLIC } }, async (request, reply) => {
        return reply.send(await new ServeService(request, reply).getGlobalVariablesByEnvironmentId(request.params.environmentId))
    })

    fastify.get<{
        Params: {
            environmentId: string
        }
    }>("/serve/global-variables/:environmentId/index.js", { config: { authMethod: AuthenticationMethod.PUBLIC } }, async (request, reply) => {
        reply.header("Content-Type", "application/javascript")
        return reply.send(await new ServeService(request, reply).getGlobalVariablesByEnvironmentIdFile(request.params.environmentId))
    })

    fastify.get<{
        Params: {
            projectId: string
        }
    }>("/serve/global-variables/auto/:projectId", { config: { authMethod: AuthenticationMethod.PUBLIC } }, async (request, reply) => {
        return reply.send(await new ServeService(request, reply).getGlobalVariablesByProjectIdAndReferer(request.params.projectId, getReferer(request)))
    })

    fastify.get<{
        Params: {
            projectId: string
        }
    }>("/serve/global-variables/auto/:projectId/index.js", { config: { authMethod: AuthenticationMethod.PUBLIC } }, async (request, reply) => {
        reply.header("Content-Type", "application/javascript")
        return reply.send(await new ServeService(request, reply).getGlobalVariablesByProjectIdAndRefererFile(request.params.projectId, getReferer(request)))
    })

    fastify.get<{
        Params: {
            projectId: string
            environmentSlug: string
        }
    }>("/serve/global-variables/:projectId/:environmentSlug", { config: { authMethod: AuthenticationMethod.PUBLIC } }, async (request, reply) => {
        return reply.send(await new ServeService(request, reply).getGlobalVariablesByProjectIdAndEnvironmentSlug(request.params.projectId, request.params.environmentSlug))
    })

    fastify.get<{
        Params: {
            mfeId: string
        }
    }>("/serve/mfe/config/:mfeId", { config: { authMethod: AuthenticationMethod.PUBLIC } }, async (request, reply) => {
        const referer = request.headers.referer
        if (!referer) {
            throw new Error("Referer not found")
        }
        return reply.send(await new ServeService(request, reply).getMicrofrontendConfigurationByMicrofrontendId(request.params.mfeId, referer))
    })

    fastify.get<{
        Params: {
            projectId: string
            mfeSlug: string
        }
    }>("/serve/mfe/config/auto/:projectId/:mfeSlug", { config: { authMethod: AuthenticationMethod.PUBLIC } }, async (request, reply) => {
        return reply.send(await new ServeService(request, reply).getMicrofrontendConfigurationByProjectIdRefererAndMfeSlug(request.params.projectId, request.params.mfeSlug, getReferer(request)))
    })

    fastify.get<{
        Params: {
            projectId: string
            environmentSlug: string
            mfeSlug: string
        }
    }>("/serve/mfe/config/:projectId/:environmentSlug/:mfeSlug", { config: { authMethod: AuthenticationMethod.PUBLIC } }, async (request, reply) => {
        return reply.send(
            await new ServeService(request, reply).getMicrofrontendConfigurationByProjectIdEnvironmentSlugAndMfeSlug(request.params.projectId, request.params.environmentSlug, request.params.mfeSlug)
        )
    })

    fastify.get<{
        Params: {
            environmentId: string
            mfeSlug: string
        }
    }>("/serve/mfe/config/:environmentId/:mfeSlug", { config: { authMethod: AuthenticationMethod.PUBLIC } }, async (request, reply) => {
        return reply.send(await new ServeService(request, reply).getMicrofrontendConfigurationByEnvironmentIdAndMfeSlug(request.params.environmentId, request.params.mfeSlug))
    })

    fastify.get<{
        Params: {
            projectId: string
            environmentSlug: string
            mfeSlug: string
            version?: string
            "*": string
        }
    }>(`/serve/mfe/files/:projectId/:environmentSlug/:mfeSlug/${VERSION_PATH_SEGMENT}/:version/*`, { config: { authMethod: AuthenticationMethod.PUBLIC } }, serveByEnvironmentSlug)

    fastify.get<{
        Params: {
            projectId: string
            environmentSlug: string
            mfeSlug: string
            version?: string
            "*": string
        }
    }>("/serve/mfe/files/:projectId/:environmentSlug/:mfeSlug/*", { config: { authMethod: AuthenticationMethod.PUBLIC } }, serveByEnvironmentSlug)

    fastify.get<{
        Params: {
            mfeId: string
            version?: string
            "*": string
        }
    }>(`/serve/mfe/files/:mfeId/${VERSION_PATH_SEGMENT}/:version/*`, { config: { authMethod: AuthenticationMethod.PUBLIC } }, serveByMicrofrontendId)

    fastify.get<{
        Params: {
            mfeId: string
            version?: string
            "*": string
        }
    }>("/serve/mfe/files/:mfeId/*", { config: { authMethod: AuthenticationMethod.PUBLIC } }, serveByMicrofrontendId)

    fastify.get<{
        Params: {
            projectId: string
            mfeSlug: string
            version?: string
            "*": string
        }
    }>(`/serve/mfe/files/auto/:projectId/:mfeSlug/${VERSION_PATH_SEGMENT}/:version/*`, { config: { authMethod: AuthenticationMethod.PUBLIC } }, serveAutoByReferer)

    fastify.get<{
        Params: {
            projectId: string
            mfeSlug: string
            version?: string
            "*": string
        }
    }>("/serve/mfe/files/auto/:projectId/:mfeSlug/*", { config: { authMethod: AuthenticationMethod.PUBLIC } }, serveAutoByReferer)

    /**
     * Serves a microfrontend file, with or without the version pinned in the URL.
     * When the service asks for a version to be pinned, the browser is redirected to the very same
     * file under `/_v/<version>/`: the entrypoint is an ES module, so its relative imports are then
     * resolved against that URL and the whole page load stays on one single version.
     */
    async function serveByEnvironmentSlug(request: FastifyRequest<{ Params: { projectId: string; environmentSlug: string; mfeSlug: string; version?: string; "*": string } }>, reply: FastifyReply) {
        const { projectId, environmentSlug, mfeSlug, version } = request.params
        const filePath = request.params["*"] || ""
        const data = await new ServeService(request, reply).getByEnvironmentSlugAndProjectIdAndMicrofrontendSlug(environmentSlug, projectId, mfeSlug, filePath, version)

        if (isRedirectToVersion(data)) {
            addHeaders(data.headers, reply)
            return reply.redirect(`/serve/mfe/files/${projectId}/${environmentSlug}/${mfeSlug}/${VERSION_PATH_SEGMENT}/${data.redirectToVersion}/${filePath}`, 302)
        }

        addHeadersFromFilePath(filePath, data.headers, reply)
        return reply.send(data.stream)
    }

    /**
     * Same as serveByEnvironmentSlug, for the URLs identifying the microfrontend by its id.
     */
    async function serveByMicrofrontendId(request: FastifyRequest<{ Params: { mfeId: string; version?: string; "*": string } }>, reply: FastifyReply) {
        const referer = request.headers.referer
        if (!referer) {
            throw new Error("Referer not found")
        }
        const { mfeId, version } = request.params
        const filePath = request.params["*"] || ""
        const data = await new ServeService(request, reply).getMicrofrontendFilesByMicrofrontendId(mfeId, filePath, referer, version)

        if (isRedirectToVersion(data)) {
            addHeaders(data.headers, reply)
            return reply.redirect(`/serve/mfe/files/${mfeId}/${VERSION_PATH_SEGMENT}/${data.redirectToVersion}/${filePath}`, 302)
        }

        addHeadersFromFilePath(filePath, data.headers, reply)
        return reply.send(data.stream)
    }

    /**
     * Same as serveByEnvironmentSlug, for the URLs that resolve the environment from the referer.
     */
    async function serveAutoByReferer(request: FastifyRequest<{ Params: { projectId: string; mfeSlug: string; version?: string; "*": string } }>, reply: FastifyReply) {
        const referer = getReferer(request)
        const { projectId, mfeSlug, version } = request.params
        const filePath = request.params["*"] || ""
        const data = await new ServeService(request, reply).getMicrofrontendFilesByProjectIdAndMicrofrontendSlug(projectId, mfeSlug, filePath, referer, version)

        if (isRedirectToVersion(data)) {
            addHeaders(data.headers, reply)
            return reply.redirect(`/serve/mfe/files/auto/${projectId}/${mfeSlug}/${VERSION_PATH_SEGMENT}/${data.redirectToVersion}/${filePath}`, 302)
        }

        addHeadersFromFilePath(filePath, data.headers, reply)
        return reply.send(data.stream)
    }

    /**
     * The domain the request comes from, which is what the "auto" URLs resolve the environment against.
     * The referer is the domain of the host page, the one registered on the environment; the host is the
     * fallback for when the browser sends no referer.
     */
    function getReferer(request: FastifyRequest): string {
        const referer = request.headers.referer || request.host || request.hostname
        if (!referer) {
            throw new Error("Referer not found")
        }
        return referer
    }

    function addHeaders(headers: Record<string, string>, reply: FastifyReply) {
        Object.entries(headers || {}).forEach(([key, value]) => {
            reply.header(key, value)
        })
    }

    function addHeadersFromFilePath(filePath: string, headers: Record<string, string>, reply: FastifyReply) {
        if (filePath.endsWith(".js")) {
            reply.header("Content-Type", "application/javascript")
        }
        if (filePath.endsWith(".css")) {
            reply.header("Content-Type", "text/css")
        }
        if (filePath.endsWith(".html")) {
            reply.header("Content-Type", "text/html")
        }
        if (filePath.endsWith(".xml")) {
            reply.header("Content-Type", "text/xml")
        }
        if (headers) {
            Object.entries(headers).forEach(([key, value]) => {
                reply.header(key, value)
            })
        }
    }
}
