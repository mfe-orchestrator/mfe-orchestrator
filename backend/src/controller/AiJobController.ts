import { FastifyInstance, FastifyRequest } from "fastify"
import ProjectHeaderNotFoundError from "../errors/ProjectHeaderNotFoundError"
import AiChangeJobService, { AiJobCreateInput, AiJobFollowUpInput } from "../service/aiChange/AiChangeJobService"
import DomainPlanService, { DomainPlanInput } from "../service/aiChange/DomainPlanService"
import { LLM_EFFORTS } from "../service/llm"
import AuthenticationMethod from "../types/AuthenticationMethod"
import { getProjectIdFromRequest } from "../utils/requestUtils"

const prompt = { type: "string", minLength: 1, maxLength: 8_000 }
// Beyond 10 the service answers AI_JOB_TOO_MANY_REPOSITORIES, which the console explains; this only bounds the body.
const microfrontendIds = { type: "array", maxItems: 100, items: { type: "string", pattern: "^[a-fA-F0-9]{24}$" } }
const serviceIds = microfrontendIds
const domainId = { type: "string", pattern: "^[a-fA-F0-9]{24}$" }
const effort = { type: "string", enum: LLM_EFFORTS }
// An id of the organization's AIs, or `system`
const aiModelId = { type: "string", minLength: 1, maxLength: 64 }
// The branch each repository starts from, by microfrontend or service id
const baseBranches = { type: "object", maxProperties: 100, propertyNames: { pattern: "^[a-fA-F0-9]{24}$" }, additionalProperties: { type: "string", minLength: 1, maxLength: 255 } }

const createBodySchema = {
    type: "object",
    required: ["prompt", "scope"],
    additionalProperties: false,
    properties: { prompt, scope: { type: "string", enum: ["global", "domain", "selection"] }, domainId, microfrontendIds, serviceIds, baseBranches, effort, aiModelId },
    // A domain job works on the members of that domain: without it there is nothing to work on.
    if: { properties: { scope: { const: "domain" } } },
    then: { required: ["domainId"] }
}

const domainPlanBodySchema = {
    type: "object",
    required: ["prompt", "domainId"],
    additionalProperties: false,
    properties: { prompt, domainId, aiModelId }
}

const listQuerySchema = {
    type: "object",
    properties: { active: { type: "string" }, domainId }
}

const followUpBodySchema = {
    type: "object",
    required: ["prompt"],
    additionalProperties: false,
    properties: { prompt, microfrontendIds, serviceIds, effort, aiModelId }
}

const projectIdOf = (request: FastifyRequest) => {
    const projectId = getProjectIdFromRequest(request)
    if (!projectId) throw new ProjectHeaderNotFoundError()
    return projectId
}

/**
 * AI agent jobs on one or more repositories (microfrontends and services) of a project, and their follow-ups.
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

    // What to create in a domain without microfrontends nor services before a job can work on it: one model call, so the same ceiling.
    fastify.post<{ Body: DomainPlanInput }>("/ai-jobs/domain-plan", { schema: { body: domainPlanBodySchema }, config: { ...config, rateLimit } }, async (request, reply) =>
        reply.send(await new DomainPlanService(request.databaseUser, fastify.config).plan(projectIdOf(request), request.body))
    )

    fastify.post<{ Params: { id: string }; Body: AiJobFollowUpInput }>("/ai-jobs/:id/follow-ups", { schema: { body: followUpBodySchema }, config: { ...config, rateLimit } }, async (request, reply) =>
        reply.status(202).send(await service(request).followUp(request.params.id, request.body))
    )

    // With a domain, everyone's conversations on it (first and latest job of each chain): the domain page shows them as a microfrontend page shows its requests.
    fastify.get<{ Querystring: { active?: string; domainId?: string } }>("/ai-jobs", { schema: { querystring: listQuerySchema }, config }, async (request, reply) =>
        reply.send(
            request.query.domainId
                ? await service(request).domainConversations(projectIdOf(request), request.query.domainId)
                : await service(request).list(projectIdOf(request), ["true", "1"].includes(request.query.active ?? ""))
        )
    )

    // Every user's agents, not only the caller's: the microfrontend list shows who is being worked on.
    fastify.get("/ai-jobs/working", { config }, async (request, reply) => reply.send(await service(request).working(projectIdOf(request))))

    fastify.get<{ Params: { id: string } }>("/ai-jobs/:id", { config }, async (request, reply) => reply.send(await service(request).get(request.params.id)))

    fastify.get<{ Params: { id: string } }>("/ai-jobs/:id/chain", { config }, async (request, reply) => reply.send(await service(request).chain(request.params.id)))

    // Answers once every proposal is claimed: the pull requests are opened in the background.
    fastify.post<{ Params: { id: string } }>("/ai-jobs/:id/apply", { config }, async (request, reply) => reply.status(202).send(await service(request).apply(request.params.id)))
}
