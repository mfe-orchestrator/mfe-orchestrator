import { FastifyInstance, FastifyRequest } from "fastify"
import ProjectHeaderNotFoundError from "../errors/ProjectHeaderNotFoundError"
import AiChangeJobService, { AiJobCreateInput, AiJobFollowUpInput } from "../service/aiChange/AiChangeJobService"
import AuthenticationMethod from "../types/AuthenticationMethod"
import { getProjectIdFromRequest } from "../utils/requestUtils"

const prompt = { type: "string", minLength: 1, maxLength: 8_000 }
// Beyond 10 the service answers AI_JOB_TOO_MANY_REPOSITORIES, which the console explains; this only bounds the body.
const microfrontendIds = { type: "array", maxItems: 100, items: { type: "string", pattern: "^[a-fA-F0-9]{24}$" } }

const createBodySchema = {
    type: "object",
    required: ["prompt", "scope"],
    additionalProperties: false,
    properties: { prompt, scope: { type: "string", enum: ["global", "selection"] }, microfrontendIds }
}

const followUpBodySchema = {
    type: "object",
    required: ["prompt"],
    additionalProperties: false,
    properties: { prompt, microfrontendIds }
}

const projectIdOf = (request: FastifyRequest) => {
    const projectId = getProjectIdFromRequest(request)
    if (!projectId) throw new ProjectHeaderNotFoundError()
    return projectId
}

/**
 * AI agent jobs on one or more repositories of a project, and their follow-ups.
 *
 * Starting a job answers at once with the job; the console polls it until every repository has its
 * proposal. Console sessions only, like the AI changes of a single microfrontend.
 */
export default async function aiJobController(fastify: FastifyInstance) {
    const service = (request: FastifyRequest) => new AiChangeJobService(request.databaseUser, fastify.config)
    const config = { authMethod: AuthenticationMethod.JWT }

    // Every job runs a paid agent for minutes, so it shares the assistant's per-user ceiling.
    const rateLimit = {
        max: fastify.config.ASSISTANT_RATE_LIMIT_MAX,
        timeWindow: "1 minute",
        hook: "preHandler" as const,
        keyGenerator: (request: FastifyRequest) => request.databaseUser?._id?.toString() ?? request.ip
    }

    fastify.post<{ Body: AiJobCreateInput }>("/ai-jobs", { schema: { body: createBodySchema }, config: { ...config, rateLimit } }, async (request, reply) =>
        reply.status(202).send(await service(request).create(projectIdOf(request), request.body))
    )

    fastify.post<{ Params: { id: string }; Body: AiJobFollowUpInput }>("/ai-jobs/:id/follow-ups", { schema: { body: followUpBodySchema }, config: { ...config, rateLimit } }, async (request, reply) =>
        reply.status(202).send(await service(request).followUp(request.params.id, request.body))
    )

    fastify.get<{ Querystring: { active?: string } }>("/ai-jobs", { config }, async (request, reply) =>
        reply.send(await service(request).list(projectIdOf(request), ["true", "1"].includes(request.query.active ?? "")))
    )

    // Every user's agents, not only the caller's: the microfrontend list shows who is being worked on.
    fastify.get("/ai-jobs/working", { config }, async (request, reply) => reply.send(await service(request).working(projectIdOf(request))))

    fastify.get<{ Params: { id: string } }>("/ai-jobs/:id", { config }, async (request, reply) => reply.send(await service(request).get(request.params.id)))

    fastify.get<{ Params: { id: string } }>("/ai-jobs/:id/chain", { config }, async (request, reply) => reply.send(await service(request).chain(request.params.id)))

    // Answers once every proposal is claimed: the pull requests are opened in the background.
    fastify.post<{ Params: { id: string } }>("/ai-jobs/:id/apply", { config }, async (request, reply) => reply.status(202).send(await service(request).apply(request.params.id)))
}
