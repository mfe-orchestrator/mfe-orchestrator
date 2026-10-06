export interface AssistantChatMessageDTO {
    role: "user" | "assistant"
    content: string
}

export interface AssistantChatRequestDTO {
    /** The whole conversation, oldest first; the last message is the user's question. */
    messages: AssistantChatMessageDTO[]
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
