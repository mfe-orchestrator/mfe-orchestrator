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
    description: string
    locale?: string
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
