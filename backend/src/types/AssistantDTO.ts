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
