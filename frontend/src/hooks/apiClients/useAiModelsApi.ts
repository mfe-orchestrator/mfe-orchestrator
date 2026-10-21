import type { AxiosError } from "axios"
import type { TFunction } from "i18next"
import { useTranslation } from "react-i18next"
import { LLM_EFFORTS, LlmEffort } from "@/types/ConfigResponseDTO"
import useApiClient, { errorCodeOf, IClientRequestMetadataExtended } from "../useApiClient"

/** The services an AI of the organization can run on. */
export const LLM_PROVIDERS = ["anthropic", "azure-foundry", "gemini", "azure-openai", "aws-bedrock"] as const

export type LlmProvider = (typeof LLM_PROVIDERS)[number]

/** The id of the AI the backend builds from its environment variables: every organization sees it, nobody edits it. */
export const SYSTEM_AI_MODEL_ID = "system"

/** What every member of the organization, and every user of a project, sees of an AI. */
export interface AiModelSummary {
    id: string
    /** Not shown for the system AI: its name is translated by the console. */
    name: string
    provider: LlmProvider
    /** The model id, or the deployment on Azure OpenAI. */
    model: string
    system: boolean
    isDefault: boolean
    /** The effort levels the AI honours, lowest first; empty when it offers no choice. */
    efforts: LlmEffort[]
}

/**
 * What an administrator of the organization sees: the secrets of `config` come as SECRET_PLACEHOLDER. The system AI
 * comes as a summary to them too: nothing of it can be edited.
 */
export interface AiModelDetail extends AiModelSummary {
    config: Record<string, unknown>
    maxEffort?: LlmEffort
    createdAt?: string
    updatedAt?: string
}

/** The AIs a project (or, for the wizard, an organization) can use, and the one preselected. */
export interface AvailableAiModels {
    models: AiModelSummary[]
    defaultId?: string
}

/** A secret sent back as SECRET_PLACEHOLDER keeps the stored one. On an update every field is optional. */
export interface AiModelDTO {
    name: string
    provider: LlmProvider
    /** Null on an update goes back to the provider's default model. */
    model?: string | null
    config: Record<string, unknown>
    /** Null on an update takes the limit away. */
    maxEffort?: LlmEffort | null
    isDefault?: boolean
}

/** Which AIs a project of the organization can use: null means every one of the organization, an empty list none. */
export interface ProjectAiAccess {
    projectId: string
    name: string
    aiModelIds: string[] | null
}

export const isAiModelDetail = (model: AiModelSummary | AiModelDetail): model is AiModelDetail => "config" in model

/** The name to show: the system AI has none of its own. */
export const aiModelLabel = (t: TFunction, model: Pick<AiModelSummary, "name" | "system">): string => (model.system ? t("ai_models.system_name") : model.name)

/** The levels of `model` the console knows, lowest first: one from a newer backend has neither a label nor a rank. */
export const effortsOf = (model?: Pick<AiModelSummary, "efforts">): LlmEffort[] => (model ? LLM_EFFORTS.filter(level => model.efforts.includes(level)) : [])

/** react-query key prefix of every availability list: a change to the AIs of the organization invalidates them all. */
export const AVAILABLE_AI_MODELS_QUERY_KEY = "ai-models-available"
export const ORGANIZATION_AI_MODELS_QUERY_KEY = "organization-ai-models"
export const PROJECT_AI_ACCESS_QUERY_KEY = "organization-ai-models-project-access"

const ERROR_KEYS: Record<string, string> = {
    AI_MODEL_NAME_TAKEN: "ai_models.errors.name_taken",
    AI_MODEL_INVALID: "ai_models.errors.invalid",
    AI_MODEL_NOT_AVAILABLE: "ai_models.errors.not_available",
    AI_MODEL_SYSTEM_READONLY: "ai_models.errors.system_readonly",
    AI_MODEL_DEFAULT_CONFLICT: "ai_models.errors.default_conflict"
}

/**
 * What the backend adds to AI_MODEL_INVALID: the one `field` refused (e.g. "config.endpoint", "model"), with
 * `reason: "secret_required"` when a stored secret has to be typed again, or every `missing` field.
 */
export interface AiModelInvalidDetails {
    field?: string
    reason?: string
    missing?: string[]
}

export const aiModelInvalidDetailsOf = (error: Error): AiModelInvalidDetails | undefined =>
    errorCodeOf(error) === "AI_MODEL_INVALID" ? (error as AxiosError<{ error?: { details?: AiModelInvalidDetails } }>).response?.data?.error?.details : undefined

const SECRET_FIELD_PATHS = ["config.apiKey", "config.secretAccessKey"]

/** The label of a field of the form, from its path in the API body. */
export const aiModelFieldLabel = (t: TFunction, path: string): string => {
    if (path === "model") return t("ai_models.form.model")
    if (path === "name") return t("ai_models.form.name")
    if (path === "provider") return t("ai_models.form.provider")
    return t(`ai_models.form.fields.${path.replace(/^config\./, "")}`, { defaultValue: path })
}

/** What is wrong with the field `details` names, or nothing when the generic message is all there is to say. */
export const aiModelInvalidFieldMessage = (t: TFunction, details: AiModelInvalidDetails): string | undefined => {
    if (!details.field) return undefined
    if (details.reason === "secret_required" || SECRET_FIELD_PATHS.includes(details.field)) return t("ai_models.errors.secret_required", { field: aiModelFieldLabel(t, details.field) })
    if (details.field === "config.endpoint") return t("ai_models.errors.endpoint_invalid")
    if (details.field === "config.region") return t("ai_models.errors.region_invalid")
    if (details.field === "config.resource") return t("ai_models.errors.resource_invalid")
    return undefined
}

/** The translated message of an AI error code, or nothing for any other error. */
export const aiModelErrorMessage = (t: TFunction, error: Error): string | undefined => {
    const details = aiModelInvalidDetailsOf(error)
    if (details?.missing?.length) return t("ai_models.errors.missing_fields", { fields: details.missing.map(path => aiModelFieldLabel(t, path)).join(", ") })
    const fieldMessage = details && aiModelInvalidFieldMessage(t, details)
    if (fieldMessage) return fieldMessage
    const key = ERROR_KEYS[errorCodeOf(error) ?? ""]
    return key ? t(key) : undefined
}

const useAiModelsApi = () => {
    const apiClient = useApiClient()
    const { t } = useTranslation()
    const customErrorMessage = (error: Error) => aiModelErrorMessage(t, error)

    const list = async (organizationId: string): Promise<(AiModelSummary | AiModelDetail)[]> => {
        const response = await apiClient.doRequest<(AiModelSummary | AiModelDetail)[]>({ url: `/api/organizations/${organizationId}/ai-models` })
        return response.data
    }

    const create = async (organizationId: string, data: AiModelDTO): Promise<AiModelDetail> => {
        const response = await apiClient.doRequest<AiModelDetail, AiModelDTO>({ url: `/api/organizations/${organizationId}/ai-models`, method: "POST", data, customErrorMessage })
        return response.data
    }

    const update = async (organizationId: string, aiModelId: string, data: Partial<AiModelDTO>): Promise<AiModelDetail> => {
        const response = await apiClient.doRequest<AiModelDetail, Partial<AiModelDTO>>({
            url: `/api/organizations/${organizationId}/ai-models/${aiModelId}`,
            method: "PUT",
            data,
            customErrorMessage
        })
        return response.data
    }

    const remove = async (organizationId: string, aiModelId: string): Promise<void> => {
        await apiClient.doRequest({ url: `/api/organizations/${organizationId}/ai-models/${aiModelId}`, method: "DELETE", customErrorMessage })
    }

    /** For the wizard, before the project exists. */
    const availableForOrganization = async (organizationId: string, metadata?: IClientRequestMetadataExtended): Promise<AvailableAiModels> => {
        const response = await apiClient.doRequest<AvailableAiModels>({ url: `/api/organizations/${organizationId}/ai-models/available`, ...metadata })
        return response.data
    }

    const projectAccess = async (organizationId: string): Promise<ProjectAiAccess[]> => {
        const response = await apiClient.doRequest<ProjectAiAccess[]>({ url: `/api/organizations/${organizationId}/ai-models/project-access` })
        return response.data
    }

    const setProjectAccess = async (projectId: string, aiModelIds: string[] | null): Promise<{ aiModelIds: string[] | null }> => {
        const response = await apiClient.doRequest<{ aiModelIds: string[] | null }, { aiModelIds: string[] | null }>({
            url: `/api/projects/${projectId}/ai-models`,
            method: "PUT",
            data: { aiModelIds },
            customErrorMessage
        })
        return response.data
    }

    /** Project-scoped: the API client sends the `Project-Id` header of the open project. */
    const available = async (metadata?: IClientRequestMetadataExtended): Promise<AvailableAiModels> => {
        const response = await apiClient.doRequest<AvailableAiModels>({ url: "/api/ai-models/available", ...metadata })
        return response.data
    }

    return { list, create, update, remove, availableForOrganization, projectAccess, setProjectAccess, available }
}

export default useAiModelsApi
