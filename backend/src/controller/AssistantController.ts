import Anthropic from "@anthropic-ai/sdk"
import { FastifyInstance, FastifyRequest } from "fastify"
import { createBusinessException } from "../errors/BusinessException"
import ProjectHeaderNotFoundError from "../errors/ProjectHeaderNotFoundError"
import AssistantService from "../service/assistant/AssistantService"
import { AssistantChatRequestDTO, AssistantProjectDraftRequestDTO } from "../types/AssistantDTO"
import AuthenticationMethod from "../types/AuthenticationMethod"
import { openEventStream, sendEvent } from "../utils/eventStream"
import { getProjectIdFromRequest } from "../utils/requestUtils"

/** Bounds on what the browser may send: the whole conversation travels on every question. */
const MAX_MESSAGES = 40
const MAX_MESSAGE_CHARS = 8_000
const MAX_DESCRIPTION_CHARS = 4_000
const HEARTBEAT = ": ping\n\n"
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
        context: {
            type: "object",
            additionalProperties: false,
            properties: {
                page: { type: "string", maxLength: 500 },
                environmentId: { type: "string", maxLength: 100 },
                locale: { type: "string", maxLength: 20 }
            }
        }
    }
}

const draftBodySchema = {
    type: "object",
    required: ["description"],
    additionalProperties: false,
    properties: {
        description: { type: "string", minLength: 1, maxLength: MAX_DESCRIPTION_CHARS },
        locale: { type: "string", maxLength: 20 }
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
     * Answers a question about the current project as a Server-Sent Events stream:
     * `text` frames carry the answer as it is written, `tool` frames say what is being
     * looked up, and a final `done` (or `error`) frame closes the stream.
     */
    fastify.post<{ Body: AssistantChatRequestDTO }>("/assistant/chat", { schema: { body: chatBodySchema }, config: { authMethod: AuthenticationMethod.JWT, rateLimit } }, async (request, reply) => {
        const projectId = getProjectIdFromRequest(request)
        if (!projectId) {
            throw new ProjectHeaderNotFoundError()
        }
        if (request.body.messages[request.body.messages.length - 1].role !== "user") {
            throw createBusinessException({ code: "ASSISTANT_INVALID_CONVERSATION", message: "The last message must come from the user" })
        }

        const service = new AssistantService(request.databaseUser, fastify.config.ANTHROPIC_API_KEY)
        await service.ensureCanChat(projectId)

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

        try {
            const stopReason = await service.chat(
                projectId,
                request.body,
                {
                    onText: delta => sendEvent(reply, "text", { delta }),
                    onToolCall: name => sendEvent(reply, "tool", { name })
                },
                abortController.signal
            )
            sendEvent(reply, "done", { stopReason })
        } catch (error) {
            if (!abortController.signal.aborted) {
                fastify.log.error({ err: error, projectId }, "Assistant chat failed")
                sendEvent(reply, "error", { code: error instanceof Anthropic.RateLimitError ? "RATE_LIMITED" : "ASSISTANT_ERROR" })
            }
        } finally {
            clearInterval(heartbeat)
        }
        reply.raw.end()
    })

    /** A first draft of a new project from a free-text description, used to prefill the wizard. */
    fastify.post<{ Body: AssistantProjectDraftRequestDTO }>(
        "/assistant/project-draft",
        { schema: { body: draftBodySchema }, config: { authMethod: AuthenticationMethod.JWT, rateLimit } },
        async (request, reply) => {
            const draft = await new AssistantService(request.databaseUser, fastify.config.ANTHROPIC_API_KEY).draftProject(request.body.description, request.body.locale)
            if (!draft) {
                throw createBusinessException({ code: "ASSISTANT_NO_DRAFT", message: "The model returned no usable draft", statusCode: 422 })
            }
            return reply.send(draft)
        }
    )
}
