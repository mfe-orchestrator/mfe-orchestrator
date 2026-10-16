import { ObjectId, Schema } from "mongoose"
import { createBusinessException } from "../../errors/BusinessException"
import AssistantConversation from "../../models/AssistantConversationModel"
import { AssistantConversationDTO, AssistantConversationMessageDTO, AssistantConversationSummaryDTO } from "../../types/AssistantDTO"
import { toObjectId } from "../../utils/mongooseUtils"
import { redactSecrets } from "./assistantTools"

/** How long a conversation is kept after it was last written to. */
export const CONVERSATION_TTL_MS = 90 * 24 * 60 * 60 * 1000
/** The history shows the most recent ones only. */
export const MAX_LISTED_CONVERSATIONS = 50
const MAX_TITLE_CHARS = 80
/** Clipped rather than rejected: one oversized field would stop the conversation from being saved at all. */
const MAX_CONTENT_CHARS = 64_000
const MAX_FIELD_CHARS = 2_000
const MAX_TOOLS = 100
const MAX_DETAILS = 50

const clip = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1)}…` : value)
/** Kept for 90 days: an API key or a password the answer repeated is masked, as in the job logs the tools return. */
const safe = (value: string, max: number) => redactSecrets(clip(value, max))

type UserId = ObjectId | Schema.Types.ObjectId

const withoutUndefined = <T extends object>(value: T): T => Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T

const conversationNotFound = () => createBusinessException({ code: "ASSISTANT_CONVERSATION_NOT_FOUND", message: "Conversation not found", statusCode: 404 })

/**
 * Only the fields the panel shows. Whatever the browser sends, tool inputs and results are never
 * stored: they can carry variable values or the key of an API key just created. What is kept of
 * the text has secrets masked.
 */
export const toStoredMessage = (message: AssistantConversationMessageDTO): AssistantConversationMessageDTO =>
    withoutUndefined({
        id: message.id,
        role: message.role,
        content: safe(message.content, MAX_CONTENT_CHARS),
        // An answer saved while it streamed reads as finished when reopened.
        status: message.status === "streaming" ? "done" : message.status,
        errorKey: message.errorKey,
        tools: message.tools?.slice(0, MAX_TOOLS).map(tool =>
            withoutUndefined({
                id: tool.id,
                name: tool.name,
                title: tool.title,
                kind: tool.kind,
                status: tool.status === "running" ? "interrupted" : tool.status,
                summary: tool.summary === undefined ? undefined : safe(tool.summary, MAX_FIELD_CHARS)
            })
        ),
        confirmation: message.confirmation && {
            actionId: message.confirmation.actionId,
            callId: message.confirmation.callId,
            name: message.confirmation.name,
            title: message.confirmation.title,
            details: message.confirmation.details.slice(0, MAX_DETAILS).map(({ label, value }) => ({ label, value: safe(value, MAX_FIELD_CHARS) })),
            expiresAt: message.confirmation.expiresAt,
            status: message.confirmation.status
        },
        usage: message.usage && { inputTokens: message.usage.inputTokens, cachedInputTokens: message.usage.cachedInputTokens, outputTokens: message.usage.outputTokens }
    })

const titleOf = (messages: AssistantConversationMessageDTO[]) => {
    const question = messages.find(message => message.role === "user")?.content ?? messages[0]?.content ?? ""
    const oneLine = question.replace(/\s+/g, " ").trim()
    return oneLine.length > MAX_TITLE_CHARS ? `${oneLine.slice(0, MAX_TITLE_CHARS - 1)}…` : oneLine
}

/** The user's conversations on the project, most recent first. */
export const listConversations = async (userId: UserId, projectId: string): Promise<AssistantConversationSummaryDTO[]> => {
    const conversations = await AssistantConversation.find({ userId, projectId: toObjectId(projectId) }, { title: 1, updatedAt: 1 })
        .sort({ updatedAt: -1 })
        .limit(MAX_LISTED_CONVERSATIONS)
        .lean()
    return conversations.map(conversation => ({ id: conversation._id, title: conversation.title, updatedAt: conversation.updatedAt }))
}

export const getConversation = async (userId: UserId, projectId: string, conversationId: string): Promise<AssistantConversationDTO> => {
    const conversation = await AssistantConversation.findOne({ _id: conversationId, userId, projectId: toObjectId(projectId) }).lean()
    if (!conversation) {
        throw conversationNotFound()
    }
    return { id: conversation._id, title: conversation.title, updatedAt: conversation.updatedAt, messages: conversation.messages }
}

/** Creates the conversation or replaces its messages. A conversation stays with its user and project. */
export const saveConversation = async (userId: UserId, projectId: string, conversationId: string, messages: AssistantConversationMessageDTO[]): Promise<void> => {
    const stored = messages.map(toStoredMessage)
    try {
        await AssistantConversation.updateOne(
            { _id: conversationId, userId, projectId: toObjectId(projectId) },
            { $set: { messages: stored, title: titleOf(stored), expiresAt: new Date(Date.now() + CONVERSATION_TTL_MS) } },
            { upsert: true }
        )
    } catch (error) {
        // The id exists for another user or project: the upsert tried to insert it again.
        if (error && typeof error === "object" && "code" in error && error.code === 11000) {
            throw conversationNotFound()
        }
        throw error
    }
}

export const deleteConversation = async (userId: UserId, projectId: string, conversationId: string): Promise<void> => {
    const { deletedCount } = await AssistantConversation.deleteOne({ _id: conversationId, userId, projectId: toObjectId(projectId) })
    if (deletedCount === 0) {
        throw conversationNotFound()
    }
}
