import type { LlmEffort } from "../service/llm/types"

export interface AssistantChatMessageDTO {
    role: "user" | "assistant"
    content: string
}

export interface AssistantChatRequestDTO {
    /**
     * The whole conversation, oldest first; the last message is the user's question, or, with a
     * `confirmation`, may be the assistant's message that asked for it.
     */
    messages: AssistantChatMessageDTO[]
    /** How hard the model reasons before answering: `medium` when left out. */
    effort?: LlmEffort
    /** The AI that answers, one the project may use: the project's default when left out. */
    aiModelId?: string
    /** The user's answer to a `confirm` frame: the turn resumes from the action it names. */
    confirmation?: {
        actionId: string
        approved: boolean
    }
    /** Where the user is in the console when asking. */
    context?: {
        page?: string
        environmentId?: string
        locale?: string
    }
}

export interface AssistantProjectDraftRequestDTO {
    /** The organization the project is created in: its AIs write the draft. */
    organizationId: string
    description: string
    locale?: string
    /** One of the organization's AIs: its default when left out. */
    aiModelId?: string
}

export interface AssistantProjectDraftDTO {
    name: string
    description: string
    environments: {
        name: string
        slug: string
        isProduction: boolean
        color: string
    }[]
    storage: "NONE" | "AWS_S3" | "GOOGLE_CLOUD_STORAGE" | "AZURE_BLOB_STORAGE"
    codeRepository: "NONE" | "GITHUB" | "GITLAB" | "AZURE_DEV_OPS"
    notes: string
}

/** A message of a saved conversation, as the panel shows it. Tool inputs and results are never kept. */
export interface AssistantConversationMessageDTO {
    id: string
    role: "user" | "assistant"
    content: string
    /** The summary of the model's reasoning, shown above the answer. */
    thinking?: string
    /** The effort the answer was asked with. */
    effort?: LlmEffort
    status?: "streaming" | "done" | "error"
    errorKey?: string
    tools?: {
        id: string
        name: string
        title: string
        kind: string
        status: string
        summary?: string
    }[]
    confirmation?: {
        actionId: string
        callId: string
        name: string
        title: string
        details: { label: string; value: string }[]
        expiresAt: string
        status: string
    }
    usage?: {
        inputTokens: number
        cachedInputTokens: number
        outputTokens: number
    }
}

export interface AssistantConversationSaveDTO {
    messages: AssistantConversationMessageDTO[]
}

/** An entry of the history: the messages are loaded when the user opens it. */
export interface AssistantConversationSummaryDTO {
    id: string
    title: string
    updatedAt: Date
}

export interface AssistantConversationDTO extends AssistantConversationSummaryDTO {
    messages: AssistantConversationMessageDTO[]
}
