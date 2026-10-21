import { FastifyInstance, FastifyRequest } from "fastify"
import AiChangeService, { AiChangeCreateInput } from "../service/aiChange/AiChangeService"
import { LLM_EFFORTS } from "../service/llm"
import AuthenticationMethod from "../types/AuthenticationMethod"

const createBodySchema = {
    type: "object",
    required: ["prompt"],
    additionalProperties: false,
    properties: {
        prompt: { type: "string", minLength: 1, maxLength: 8_000 },
        baseBranch: { type: "string", maxLength: 255 },
        effort: { type: "string", enum: LLM_EFFORTS },
        // An id of the organization's AIs, or `system`
        aiModelId: { type: "string", minLength: 1, maxLength: 64 }
    }
}

// A proposal is applied whole: its files depend on each other, so none can be left out.
const applyBodySchema = {
    type: "object",
    additionalProperties: false,
    properties: {}
}

/**
 * Code changes proposed by an AI agent on the repository of a microfrontend.
 *
 * Creating one starts a background job and answers at once; the console polls the request until
 * the proposal is ready, then applies it onto the base branch, opens a pull request from its
 * feature branch, or discards it. Console sessions only: an API key or an MCP
 * client cannot start an agent that spends the installation's model budget.
 */
export default async function aiChangeController(fastify: FastifyInstance) {
    const service = (request: FastifyRequest) => new AiChangeService(request.databaseUser, fastify.config)
    const config = { authMethod: AuthenticationMethod.JWT }

    // Every request runs a paid agent for minutes, so it shares the assistant's per-user ceiling.
    const rateLimit = {
        max: fastify.config.ASSISTANT_RATE_LIMIT_MAX,
        timeWindow: "1 minute",
        hook: "preHandler" as const,
        keyGenerator: (request: FastifyRequest) => request.databaseUser?._id?.toString() ?? request.ip
    }

    fastify.post<{ Params: { id: string }; Body: AiChangeCreateInput }>(
        "/microfrontends/:id/ai-changes",
        { schema: { body: createBodySchema }, config: { ...config, rateLimit } },
        async (request, reply) => reply.status(202).send(await service(request).create(request.params.id, request.body))
    )

    fastify.get<{ Params: { id: string } }>("/microfrontends/:id/ai-changes", { config }, async (request, reply) => reply.send(await service(request).list(request.params.id)))

    fastify.get<{ Params: { id: string } }>("/ai-changes/:id", { config }, async (request, reply) => reply.send(await service(request).get(request.params.id)))

    fastify.post<{ Params: { id: string }; Body: Record<string, never> }>("/ai-changes/:id/apply", { schema: { body: applyBodySchema }, config }, async (request, reply) =>
        reply.send(await service(request).apply(request.params.id))
    )

    fastify.post<{ Params: { id: string } }>("/ai-changes/:id/pull-request", { config }, async (request, reply) => reply.send(await service(request).openPullRequest(request.params.id)))

    fastify.post<{ Params: { id: string } }>("/ai-changes/:id/discard", { config }, async (request, reply) => reply.send(await service(request).discard(request.params.id)))
}
