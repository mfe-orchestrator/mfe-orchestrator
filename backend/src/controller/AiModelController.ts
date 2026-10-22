import { FastifyInstance, FastifyRequest } from "fastify"
import ProjectHeaderNotFoundError from "../errors/ProjectHeaderNotFoundError"
import { AI_MODEL_NAME_MAX_LENGTH } from "../models/AiModelModel"
import AiModelService, { AiModelInput } from "../service/AiModelService"
import { LLM_EFFORTS, LlmProvider } from "../service/llm"
import AuthenticationMethod from "../types/AuthenticationMethod"
import { getProjectIdFromRequest } from "../utils/requestUtils"

const OBJECT_ID = "^[a-fA-F0-9]{24}$"
/** An id of the organization's AIs, or `system`. */
const aiModelId = { type: "string", minLength: 1, maxLength: 64 }
const CONFIG_STRING = { type: "string", maxLength: 2_000 }

/** Every key any provider reads: the service keeps those of the chosen provider and drops the rest. */
const config = {
    type: "object",
    additionalProperties: false,
    properties: {
        apiKey: CONFIG_STRING,
        resource: CONFIG_STRING,
        endpoint: CONFIG_STRING,
        reasoning: { type: "boolean" },
        region: CONFIG_STRING,
        accessKeyId: CONFIG_STRING,
        secretAccessKey: CONFIG_STRING
    }
}

/** null clears the model (the provider's default) or the cap (every effort the provider takes). */
const aiModelProperties = {
    name: { type: "string", minLength: 1, maxLength: AI_MODEL_NAME_MAX_LENGTH },
    provider: { type: "string", enum: Object.values(LlmProvider) },
    model: { type: ["string", "null"], maxLength: 200 },
    config,
    maxEffort: { type: ["string", "null"], enum: [...LLM_EFFORTS, null] },
    isDefault: { type: "boolean" }
}

const createBodySchema = { type: "object", required: ["name", "provider", "config"], additionalProperties: false, properties: aiModelProperties }

const updateBodySchema = { type: "object", additionalProperties: false, properties: aiModelProperties }

const organizationParamsSchema = { type: "object", required: ["organizationId"], properties: { organizationId: { type: "string", pattern: OBJECT_ID } } }

const aiModelParamsSchema = {
    type: "object",
    required: ["organizationId", "aiModelId"],
    properties: { organizationId: { type: "string", pattern: OBJECT_ID }, aiModelId }
}

const projectAccessParamsSchema = { type: "object", required: ["projectId"], properties: { projectId: { type: "string", pattern: OBJECT_ID } } }

const projectAccessBodySchema = {
    type: "object",
    required: ["aiModelIds"],
    additionalProperties: false,
    properties: { aiModelIds: { type: ["array", "null"], maxItems: 100, items: aiModelId } }
}

/**
 * The AIs an organization defines, which of them each project may use, and the ones the current
 * project (or the wizard of an organization) may choose from. Console sessions only: the
 * configuration carries credentials, and the choice serves the console's AI features.
 */
export default async function aiModelController(fastify: FastifyInstance) {
    const service = (request: FastifyRequest) => new AiModelService(request.databaseUser, fastify.config)
    const routeConfig = { authMethod: AuthenticationMethod.JWT }

    fastify.get<{ Params: { organizationId: string } }>("/organizations/:organizationId/ai-models", { schema: { params: organizationParamsSchema }, config: routeConfig }, async (request, reply) =>
        reply.send(await service(request).list(request.params.organizationId))
    )

    fastify.post<{ Params: { organizationId: string }; Body: AiModelInput }>(
        "/organizations/:organizationId/ai-models",
        { schema: { params: organizationParamsSchema, body: createBodySchema }, config: routeConfig },
        async (request, reply) => reply.status(201).send(await service(request).create(request.params.organizationId, request.body))
    )

    // What the wizard may draft a project with, before the project exists
    fastify.get<{ Params: { organizationId: string } }>(
        "/organizations/:organizationId/ai-models/available",
        { schema: { params: organizationParamsSchema }, config: routeConfig },
        async (request, reply) => reply.send(await service(request).availableForOrganization(request.params.organizationId))
    )

    fastify.get<{ Params: { organizationId: string } }>(
        "/organizations/:organizationId/ai-models/project-access",
        { schema: { params: organizationParamsSchema }, config: routeConfig },
        async (request, reply) => reply.send(await service(request).projectAccess(request.params.organizationId))
    )

    fastify.put<{ Params: { organizationId: string; aiModelId: string }; Body: AiModelInput }>(
        "/organizations/:organizationId/ai-models/:aiModelId",
        { schema: { params: aiModelParamsSchema, body: updateBodySchema }, config: routeConfig },
        async (request, reply) => reply.send(await service(request).update(request.params.organizationId, request.params.aiModelId, request.body))
    )

    fastify.delete<{ Params: { organizationId: string; aiModelId: string } }>(
        "/organizations/:organizationId/ai-models/:aiModelId",
        { schema: { params: aiModelParamsSchema }, config: routeConfig },
        async (request, reply) => {
            await service(request).delete(request.params.organizationId, request.params.aiModelId)
            return reply.status(204).send()
        }
    )

    fastify.put<{ Params: { projectId: string }; Body: { aiModelIds: string[] | null } }>(
        "/projects/:projectId/ai-models",
        { schema: { params: projectAccessParamsSchema, body: projectAccessBodySchema }, config: routeConfig },
        async (request, reply) => reply.send(await service(request).setProjectAccess(request.params.projectId, request.body.aiModelIds))
    )

    fastify.get("/ai-models/available", { config: routeConfig }, async (request, reply) => {
        const projectId = getProjectIdFromRequest(request)
        if (!projectId) throw new ProjectHeaderNotFoundError()
        return reply.send(await service(request).availableForProject(projectId))
    })
}
