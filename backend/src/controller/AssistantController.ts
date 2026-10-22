import { FastifyInstance, FastifyRequest } from "fastify"
import { createBusinessException } from "../errors/BusinessException"
import ProjectHeaderNotFoundError from "../errors/ProjectHeaderNotFoundError"
import AssistantUsage from "../models/AssistantUsageModel"
import AssistantService from "../service/assistant/AssistantService"
import { deleteConversation, getConversation, listConversations, saveConversation } from "../service/assistant/conversations"
import { isRateLimitError, LLM_EFFORTS, LlmEffort, LlmProvider, LlmUsage } from "../service/llm"
import { AssistantChatRequestDTO, AssistantConversationSaveDTO, AssistantProjectDraftRequestDTO } from "../types/AssistantDTO"
import AuthenticationMethod from "../types/AuthenticationMethod"
import { openEventStream, sendEvent } from "../utils/eventStream"
import { toObjectId } from "../utils/mongooseUtils"
import { getProjectIdFromRequest } from "../utils/requestUtils"

/** Bounds on what the browser may send: the whole conversation travels on every question. */
const MAX_MESSAGES = 40
const MAX_MESSAGE_CHARS = 8_000
const MAX_DESCRIPTION_CHARS = 4_000
const HEARTBEAT = ": ping\n\n"
/** An id of the organization's AIs, or `system`. */
const AI_MODEL_ID = { type: "string", minLength: 1, maxLength: 64 }
const HEARTBEAT_INTERVAL_MS = 15_000

const chatBodySchema = {
    type: "object",
    required: ["messages"],
    additionalProperties: false,
    properties: {
        messages: {
            type: "array",
            minItems: 1,
            maxItems: MAX_MESSAGES,
            items: {
                type: "object",
                required: ["role", "content"],
                additionalProperties: false,
                properties: {
                    role: { type: "string", enum: ["user", "assistant"] },
                    content: { type: "string", minLength: 1, maxLength: MAX_MESSAGE_CHARS }
                }
            }
        },
        effort: { type: "string", enum: LLM_EFFORTS },
        aiModelId: AI_MODEL_ID,
        context: {
            type: "object",
            additionalProperties: false,
            properties: {
                page: { type: "string", maxLength: 500 },
                environmentId: { type: "string", maxLength: 100 },
                locale: { type: "string", maxLength: 20 }
            }
        },
        confirmation: {
            type: "object",
            required: ["actionId", "approved"],
            additionalProperties: false,
            properties: {
                actionId: { type: "string", minLength: 1, maxLength: 100 },
                approved: { type: "boolean" }
            }
        }
    }
}

const draftBodySchema = {
    type: "object",
    required: ["organizationId", "description"],
    additionalProperties: false,
    properties: {
        organizationId: { type: "string", pattern: "^[a-fA-F0-9]{24}$" },
        description: { type: "string", minLength: 1, maxLength: MAX_DESCRIPTION_CHARS },
        locale: { type: "string", maxLength: 20 },
        aiModelId: AI_MODEL_ID
    }
}

// Lengths are not bounded here: an oversized field is clipped when stored (see conversations.ts),
// as rejecting it would stop the conversation from being saved for good. The body limit caps the whole.
const CONVERSATION_BODY_LIMIT = 4 * 1024 * 1024
const SHORT_STRING = { type: "string", maxLength: 200 }

const conversationParamsSchema = {
    type: "object",
    required: ["conversationId"],
    properties: { conversationId: { type: "string", pattern: "^[A-Za-z0-9_-]{8,64}$" } }
}

const conversationBodySchema = {
    type: "object",
    required: ["messages"],
    additionalProperties: false,
    properties: {
        messages: {
            type: "array",
            minItems: 1,
            maxItems: MAX_MESSAGES,
            items: {
                type: "object",
                required: ["id", "role", "content"],
                properties: {
                    id: { type: "string", minLength: 1, maxLength: 100 },
                    role: { type: "string", enum: ["user", "assistant"] },
                    content: { type: "string" },
                    thinking: { type: "string" },
                    effort: SHORT_STRING,
                    status: { type: "string", enum: ["streaming", "done", "error"] },
                    errorKey: SHORT_STRING,
                    tools: {
                        type: "array",
                        items: {
                            type: "object",
                            required: ["id", "name", "title", "kind", "status"],
                            properties: { id: SHORT_STRING, name: SHORT_STRING, title: SHORT_STRING, kind: SHORT_STRING, status: SHORT_STRING, summary: { type: "string" } }
                        }
                    },
                    confirmation: {
                        type: "object",
                        required: ["actionId", "callId", "name", "title", "details", "expiresAt", "status"],
                        properties: {
                            actionId: SHORT_STRING,
                            callId: SHORT_STRING,
                            name: SHORT_STRING,
                            title: SHORT_STRING,
                            details: {
                                type: "array",
                                items: { type: "object", required: ["label", "value"], properties: { label: SHORT_STRING, value: { type: "string" } } }
                            },
                            expiresAt: SHORT_STRING,
                            status: SHORT_STRING
                        }
                    },
                    usage: {
                        type: "object",
                        required: ["inputTokens", "cachedInputTokens", "outputTokens"],
                        properties: { inputTokens: { type: "number" }, cachedInputTokens: { type: "number" }, outputTokens: { type: "number" } }
                    }
                }
            }
        }
    }
}

export default async function assistantController(fastify: FastifyInstance) {
    // Every question is a paid call to the model, so the assistant gets a ceiling of its own,
    // well below the one that applies to the rest of the API.
    // Keyed by user, not IP: behind the bundled nginx every request comes from 127.0.0.1, and a
    // per-IP ceiling would be shared by the whole installation. Hence the preHandler hook, which
    // runs after authentication has resolved the user.
    const rateLimit = {
        max: fastify.config.ASSISTANT_RATE_LIMIT_MAX,
        timeWindow: "1 minute",
        hook: "preHandler" as const,
        keyGenerator: (request: FastifyRequest) => request.databaseUser?._id?.toString() ?? request.ip
    }

    /**
     * Answers a question about the current project, or carries on after the user answered a
     * confirmation, as a Server-Sent Events stream: `text` frames carry the answer as it is
     * written, `thinking` frames the summary of the model's reasoning, `tool_call` /
     * `tool_result` frames what the tools do, `confirm` a destructive action waiting for the user,
     * and a final `done` (or `error`) frame closes the stream. The frames are described in
     * `service/assistant/assistantActions.ts`.
     */
    fastify.post<{ Body: AssistantChatRequestDTO }>("/assistant/chat", { schema: { body: chatBodySchema }, config: { authMethod: AuthenticationMethod.JWT, rateLimit } }, async (request, reply) => {
        const projectId = getProjectIdFromRequest(request)
        if (!projectId) {
            throw new ProjectHeaderNotFoundError()
        }
        const { confirmation } = request.body
        // Answering a confirmation resumes the assistant's own turn, which may end with its message.
        if (!confirmation && request.body.messages[request.body.messages.length - 1].role !== "user") {
            throw createBusinessException({ code: "ASSISTANT_INVALID_CONVERSATION", message: "The last message must come from the user" })
        }

        const service = new AssistantService(request.databaseUser, fastify.config, request.log)
        await service.ensureCanChat(projectId, request.body.aiModelId)
        // Taken before the stream opens, so an expired or foreign action is an HTTP error, and only
        // once: a second answer to the same card finds nothing.
        const action = confirmation ? await service.takeConfirmation(projectId, confirmation.actionId) : undefined

        openEventStream(reply)

        // The response, not the request: on a POST the request emits "close" as soon as its
        // body has been read, long before the user goes away.
        const abortController = new AbortController()
        reply.raw.on("close", () => {
            if (!reply.raw.writableEnded) abortController.abort()
        })
        if (reply.raw.destroyed) abortController.abort()

        // Tool calls (a dependency scan, several job logs) and the model's first token can leave
        // the stream silent for longer than a proxy's idle timeout; comment frames keep it open.
        const heartbeat = setInterval(() => reply.raw.write(HEARTBEAT), HEARTBEAT_INTERVAL_MS)

        let answered: { stopReason: string; usage: LlmUsage; effort: LlmEffort; aiModelId: string; provider: LlmProvider } | undefined
        try {
            const { stopReason, wrote, usage, effort, aiModelId, provider } = await service.chat(
                projectId,
                request.body,
                {
                    onText: delta => sendEvent(reply, "text", { delta }),
                    onThinking: delta => sendEvent(reply, "thinking", { delta }),
                    onToolCall: frame => sendEvent(reply, "tool_call", frame),
                    onToolResult: frame => sendEvent(reply, "tool_result", frame),
                    onConfirm: frame => sendEvent(reply, "confirm", frame)
                },
                abortController.signal,
                action && confirmation ? { action, approved: confirmation.approved } : undefined
            )
            sendEvent(reply, "done", { stopReason, wrote, usage })
            answered = { stopReason, usage, effort, aiModelId, provider }
        } catch (error) {
            if (!abortController.signal.aborted) {
                fastify.log.error({ err: error, projectId }, "Assistant chat failed")
                sendEvent(reply, "error", { code: isRateLimitError(error) ? "RATE_LIMITED" : "ASSISTANT_ERROR" })
            }
        } finally {
            clearInterval(heartbeat)
        }
        reply.raw.end()

        if (answered) {
            const { stopReason, usage, effort, aiModelId, provider } = answered
            // One line and one document per answer: what the assistant costs, per user and project, on which AI and at which effort.
            fastify.log.info({ audit: "assistant_usage", userId: request.databaseUser?._id?.toString(), projectId, stopReason, effort, aiModelId, provider, ...usage }, "Assistant answer usage")
            // Once the stream is closed and not awaited: the browser does not wait on the write, and a failed one cannot become an error frame.
            void (async () => {
                try {
                    await AssistantUsage.create({ userId: request.databaseUser?._id, projectId: toObjectId(projectId), provider, aiModelId, stopReason, effort, ...usage })
                } catch (error) {
                    fastify.log.error({ err: error, projectId }, "Assistant usage not saved")
                }
            })()
        }
    })

    /** A first draft of a new project from a free-text description, used to prefill the wizard. */
    fastify.post<{ Body: AssistantProjectDraftRequestDTO }>(
        "/assistant/project-draft",
        { schema: { body: draftBodySchema }, config: { authMethod: AuthenticationMethod.JWT, rateLimit } },
        async (request, reply) => {
            const { organizationId, description, locale, aiModelId } = request.body
            const draft = await new AssistantService(request.databaseUser, fastify.config, request.log).draftProject(organizationId, description, locale, aiModelId)
            if (!draft) {
                throw createBusinessException({ code: "ASSISTANT_NO_DRAFT", message: "The model returned no usable draft", statusCode: 422 })
            }
            return reply.send(draft)
        }
    )

    /**
     * The user's own conversations on the project open in the console, so that one can be reopened.
     * The panel saves the conversation after every answer.
     */
    const conversationProjectId = async (request: FastifyRequest) => {
        const projectId = getProjectIdFromRequest(request)
        if (!projectId) {
            throw new ProjectHeaderNotFoundError()
        }
        await new AssistantService(request.databaseUser, fastify.config).ensureCanChat(projectId)
        return projectId
    }

    fastify.get("/assistant/conversations", { config: { authMethod: AuthenticationMethod.JWT } }, async (request, reply) => {
        const projectId = await conversationProjectId(request)
        return reply.send(await listConversations(request.databaseUser._id, projectId))
    })

    fastify.get<{ Params: { conversationId: string } }>(
        "/assistant/conversations/:conversationId",
        { schema: { params: conversationParamsSchema }, config: { authMethod: AuthenticationMethod.JWT } },
        async (request, reply) => {
            const projectId = await conversationProjectId(request)
            return reply.send(await getConversation(request.databaseUser._id, projectId, request.params.conversationId))
        }
    )

    fastify.put<{ Params: { conversationId: string }; Body: AssistantConversationSaveDTO }>(
        "/assistant/conversations/:conversationId",
        { bodyLimit: CONVERSATION_BODY_LIMIT, schema: { params: conversationParamsSchema, body: conversationBodySchema }, config: { authMethod: AuthenticationMethod.JWT } },
        async (request, reply) => {
            const projectId = await conversationProjectId(request)
            await saveConversation(request.databaseUser._id, projectId, request.params.conversationId, request.body.messages)
            return reply.code(204).send()
        }
    )

    fastify.delete<{ Params: { conversationId: string } }>(
        "/assistant/conversations/:conversationId",
        { schema: { params: conversationParamsSchema }, config: { authMethod: AuthenticationMethod.JWT } },
        async (request, reply) => {
            const projectId = await conversationProjectId(request)
            await deleteConversation(request.databaseUser._id, projectId, request.params.conversationId)
            return reply.code(204).send()
        }
    )
}
