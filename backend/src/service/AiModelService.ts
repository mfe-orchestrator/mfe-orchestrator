import { ObjectId, Schema } from "mongoose"
import AssistantDisabledError from "../errors/AssistantDisabledError"
import { createBusinessException } from "../errors/BusinessException"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import AiModel, { AI_MODEL_NAME_MAX_LENGTH, IAiModel } from "../models/AiModelModel"
import Project from "../models/ProjectModel"
import { toObjectId } from "../utils/mongooseUtils"
import { runInTransaction } from "../utils/runInTransaction"
import { SECRET_PLACEHOLDER } from "../utils/secretCrypto"
import BaseAuthorizedService, { AuthorizedPrincipal } from "./BaseAuthorizedService"
import {
    AI_MODEL_CONFIG_KEYS,
    AI_MODEL_SECRET_KEYS,
    AiModelConfig,
    AiModelSettings,
    azureOpenAiEndpointProblem,
    azureOpenAiHostSuffixes,
    defaultModelOf,
    effortsFor,
    forgetLlmClient,
    getLlmClient,
    LlmClient,
    LlmConfiguration,
    LlmEffort,
    LlmProvider,
    SYSTEM_AI_MODEL_ID,
    systemAiModel
} from "./llm"

/** An AI as every member of the organization sees it: enough to pick one, nothing of how it is reached. */
export interface AiModelSummary {
    id: string
    name: string
    provider: LlmProvider
    model: string
    /** The AI of the environment variables: shared by every organization, read-only. */
    system: boolean
    isDefault: boolean
    /** The effort levels it takes, lowest first: empty when it takes none. */
    efforts: LlmEffort[]
}

/** An AI as the administrators of the organization see it, to edit it: the secrets are the placeholder. */
export interface AiModelDetail extends AiModelSummary {
    config: Record<string, unknown>
    maxEffort?: LlmEffort
    createdAt?: Date
    updatedAt?: Date
}

/** The AIs a project (or the wizard of an organization) may use, and the one preselected. */
export interface AvailableAiModels {
    models: AiModelSummary[]
    defaultId?: string
}

/** The body of a create, or of a partial update: `null` clears the model or the cap. */
export interface AiModelInput {
    name?: string
    provider?: LlmProvider
    model?: string | null
    config?: AiModelConfig
    maxEffort?: LlmEffort | null
    isDefault?: boolean
}

export interface ProjectAiModelAccess {
    projectId: string
    name: string
    /** null: every AI of the organization. */
    aiModelIds: string[] | null
}

export interface ResolvedAiModel {
    settings: AiModelSettings
    client: LlmClient
}

/** An AI a project may be given: the organization's own, or the system one. */
export interface AiModelCandidate {
    settings: AiModelSettings
    isDefault: boolean
    system: boolean
    /** The stored AI, for the dates of its detail: none for the system one. */
    document?: IAiModel
}

type Id = string | ObjectId | Schema.Types.ObjectId

/**
 * An AI that cannot be saved. `details.field` always names the first field at fault (`name`, `provider`,
 * `model`, `config.<key>`), `details.missing` lists them all when several are, and `details.reason` is
 * `secret_required` when a stored credential cannot be reused and has to be typed again.
 */
const invalid = (message: string, fields: string[], reason?: "secret_required") =>
    createBusinessException({ code: "AI_MODEL_INVALID", message, statusCode: 422, details: { field: fields[0], ...(fields.length > 1 ? { missing: fields } : {}), ...(reason ? { reason } : {}) } })

const secretRequired = (keys: string[]) =>
    invalid(
        `Type ${keys.join(", ")} again: a stored credential is kept only while the provider and where it is sent stay the same`,
        keys.map(key => `config.${key}`),
        "secret_required"
    )

const notAvailable = (aiModelId: string) => createBusinessException({ code: "AI_MODEL_NOT_AVAILABLE", message: `The AI ${aiModelId} is not available here`, statusCode: 422 })

const systemReadOnly = () => createBusinessException({ code: "AI_MODEL_SYSTEM_READONLY", message: "The system AI is configured by the installation: it cannot be edited nor deleted", statusCode: 409 })

const nameTaken = (name: string) => createBusinessException({ code: "AI_MODEL_NAME_TAKEN", message: `The organization already has an AI named ${name}`, statusCode: 409 })

const defaultConflict = () => createBusinessException({ code: "AI_MODEL_DEFAULT_CONFLICT", message: "Another AI was made the default at the same time: try again", statusCode: 409 })

/** Mongo's duplicate key error: a unique index caught two saves racing, on the same name or both made the default. */
const duplicateKeyOf = (error: unknown) => {
    const { code, keyPattern } = (error ?? {}) as { code?: unknown; keyPattern?: Record<string, unknown> }
    return code === 11000 ? (keyPattern?.isDefault ? "default" : "name") : undefined
}

/** Region names only: the region becomes part of the host the requests, signed with the keys, are sent to. */
const AWS_REGION = /^[a-z]{2}(-[a-z]+)+-\d+$/
/** A resource name only, for the same reason: it is the subdomain of services.ai.azure.com. */
const FOUNDRY_RESOURCE = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/

export const settingsOf = (model: IAiModel): AiModelSettings => ({
    id: String(model._id),
    name: model.name,
    provider: model.provider,
    model: model.modelId || defaultModelOf(model.provider) || "",
    config: model.config ?? {},
    maxEffort: model.maxEffort,
    updatedAt: model.updatedAt
})

/** The organization's AIs by name, then the system one: the order of every list, and of the default when none is marked. */
export const candidatesFrom = (models: IAiModel[], system: AiModelSettings | undefined): AiModelCandidate[] => [
    ...[...models]
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
        .map(document => ({ settings: settingsOf(document), isDefault: Boolean(document.isDefault), system: false, document })),
    ...(system ? [{ settings: system, isDefault: false, system: true }] : [])
]

/** What a project may use: everything without a restriction, only the AIs it lists otherwise (none for an empty list). */
export const restrictTo = (candidates: AiModelCandidate[], aiModelIds: string[] | null | undefined): AiModelCandidate[] =>
    Array.isArray(aiModelIds) ? candidates.filter(candidate => aiModelIds.includes(candidate.settings.id)) : candidates

/** The AI preselected: the one the organization marked as default when the project may use it, else the first. */
export const defaultOf = (candidates: AiModelCandidate[]): AiModelCandidate | undefined => candidates.find(candidate => candidate.isDefault) ?? candidates[0]

export const toSummary = ({ settings, isDefault, system }: AiModelCandidate): AiModelSummary => ({
    id: settings.id,
    name: settings.name,
    provider: settings.provider,
    model: settings.model,
    system,
    isDefault,
    efforts: effortsFor(settings)
})

/** The config with every credential replaced by the placeholder, so that submitting the form untouched keeps it. */
const maskedConfig = (config: AiModelConfig): Record<string, unknown> => {
    const masked: Record<string, unknown> = { ...config }
    for (const key of AI_MODEL_SECRET_KEYS) {
        if (masked[key]) masked[key] = SECRET_PLACEHOLDER
    }
    return masked
}

export const toDetail = (candidate: AiModelCandidate): AiModelDetail => ({
    ...toSummary(candidate),
    config: maskedConfig(candidate.settings.config),
    maxEffort: candidate.settings.maxEffort,
    createdAt: candidate.document?.createdAt,
    updatedAt: candidate.document?.updatedAt
})

const toAvailable = (candidates: AiModelCandidate[]): AvailableAiModels => ({ models: candidates.map(toSummary), defaultId: defaultOf(candidates)?.settings.id })

/** The keys the provider reads, strings trimmed: whatever else the body carried is not stored. */
const normalizeConfig = (provider: LlmProvider, config: AiModelConfig | undefined): AiModelConfig => {
    const { required, optional } = AI_MODEL_CONFIG_KEYS[provider]
    const normalized: Record<string, unknown> = {}
    for (const key of [...required, ...optional]) {
        const value = (config ?? {})[key]
        if (typeof value === "string" && value.trim()) normalized[key] = value.trim()
        else if (typeof value === "boolean") normalized[key] = value
    }
    return normalized as AiModelConfig
}

/** Who a credential is sent to: a key is lent to the same destination only, as with the storages. */
const destinationOf = (provider: LlmProvider, config: AiModelConfig) => JSON.stringify([provider, config.resource, config.endpoint, config.accessKeyId])

/**
 * The incoming config with every credential the caller did not retype taken from the stored AI.
 *
 * The edit form submits all of its fields, and the credentials it never received come back as the
 * placeholder; without this they would be saved literally. A credential is lent only to the provider,
 * resource, endpoint or access key id it was saved with: pointing it elsewhere means typing it again,
 * or an administrator could send the key of a colleague to an endpoint of their own.
 */
export const withUnchangedSecrets = (provider: LlmProvider, incoming: AiModelConfig, existing?: Pick<IAiModel, "provider" | "config">): AiModelConfig => {
    const config: Record<string, unknown> = { ...incoming }
    const lendable = existing && destinationOf(existing.provider, existing.config ?? {}) === destinationOf(provider, incoming) ? (existing.config as Record<string, unknown>) : undefined
    const retype = AI_MODEL_SECRET_KEYS.filter(key => config[key] === SECRET_PLACEHOLDER && !lendable?.[key])
    if (retype.length) throw secretRequired(retype)
    for (const key of AI_MODEL_SECRET_KEYS) {
        if (config[key] === SECRET_PLACEHOLDER) config[key] = lendable![key]
    }
    return config as AiModelConfig
}

/** The config without its credentials: what may follow an AI to another provider. */
const withoutSecrets = (config: AiModelConfig): AiModelConfig => {
    const kept: Record<string, unknown> = { ...config }
    for (const key of AI_MODEL_SECRET_KEYS) delete kept[key]
    return kept as AiModelConfig
}

const ensureProvider: (provider: LlmProvider | undefined) => asserts provider is LlmProvider = provider => {
    if (!provider || !Object.values(LlmProvider).includes(provider)) throw invalid(`provider must be one of ${Object.values(LlmProvider).join(", ")}`, ["provider"])
}

/** What each provider cannot work without, and the shape of what ends up in a URL. `suffixes`: the Azure OpenAI hosts allowed. */
export const validateAiModel = (provider: LlmProvider, model: string | undefined, config: AiModelConfig, suffixes: string[]): void => {
    const missing: string[] = AI_MODEL_CONFIG_KEYS[provider].required.filter(key => !config[key]).map(key => `config.${key}`)
    if (!model && !defaultModelOf(provider)) missing.unshift("model")
    if (missing.length) throw invalid(`A ${provider} AI needs ${missing.join(", ")}`, missing)
    if (config.resource && !FOUNDRY_RESOURCE.test(config.resource)) throw invalid("The resource is a name, like my-foundry, not a URL", ["config.resource"])
    if (config.region && !AWS_REGION.test(config.region)) throw invalid("The region is an AWS region, like eu-west-1", ["config.region"])
    const problem = config.endpoint ? azureOpenAiEndpointProblem(config.endpoint, suffixes) : undefined
    if (problem) throw invalid(`The endpoint ${problem}: it is https://<resource>.openai.azure.com/ or another Azure OpenAI host`, ["config.endpoint"])
}

/**
 * The AIs organizations define, their assignment to projects, and the choice of the one that answers.
 *
 * Every AI feature resolves its model here: an organization's own AIs, plus the one the environment
 * variables describe (the system AI), narrowed to what the project was given.
 */
export class AiModelService extends BaseAuthorizedService {
    constructor(
        user: AuthorizedPrincipal | undefined,
        private readonly config: LlmConfiguration
    ) {
        super(user)
    }

    private async candidatesOf(organizationId: Id): Promise<AiModelCandidate[]> {
        return candidatesFrom(await AiModel.find({ organizationId: toObjectId(organizationId) }), systemAiModel(this.config))
    }

    /** What a project may use, without checking who asks: the callers have. */
    private async availableToProject(projectId: Id): Promise<AiModelCandidate[]> {
        const project = await Project.findById(toObjectId(projectId), { organizationId: 1, aiModelIds: 1 })
        if (!project) throw new EntityNotFoundError(String(projectId))
        return restrictTo(await this.candidatesOf(project.organizationId), project.aiModelIds)
    }

    /** The one asked for, else the preferred one while still there, else the default. No AI at all is AI off. */
    private resolve(candidates: AiModelCandidate[], aiModelId?: string, preferredId?: string): ResolvedAiModel {
        if (candidates.length === 0) throw new AssistantDisabledError()
        const byId = (id?: string) => (id ? candidates.find(candidate => candidate.settings.id === id) : undefined)
        const chosen = aiModelId ? byId(aiModelId) : (byId(preferredId) ?? defaultOf(candidates))
        if (!chosen) throw notAvailable(aiModelId!)
        return { settings: chosen.settings, client: getLlmClient(chosen.settings, this.config) }
    }

    /** With the collation of the unique index: names differing only by case are the same name. */
    private async ensureNameFree(organizationId: Id, name: string, exceptId?: IAiModel["_id"]) {
        const filter = { organizationId: toObjectId(organizationId), name, ...(exceptId ? { _id: { $ne: exceptId } } : {}) }
        if (await AiModel.exists(filter).collation({ locale: "en", strength: 2 })) throw nameTaken(name)
    }

    /**
     * Saves the AI. One marked as the default unmarks the others first: the unique index on the default
     * would refuse it otherwise, and refuses one of two made the default at the same time.
     */
    private async saved(organizationId: Id, document: IAiModel): Promise<IAiModel> {
        if (document.isDefault) await AiModel.updateMany({ organizationId: toObjectId(organizationId), _id: { $ne: document._id }, isDefault: true }, { isDefault: false })
        try {
            return await document.save()
        } catch (error) {
            const duplicate = duplicateKeyOf(error)
            if (duplicate === "name") throw nameTaken(document.name)
            if (duplicate === "default") throw defaultConflict()
            throw error
        }
    }

    /**
     * Every AI of the organization, the system one included: with its configuration for an administrator
     * only, and never the system AI's, which belongs to the installation.
     */
    async list(organizationId: Id): Promise<(AiModelSummary | AiModelDetail)[]> {
        await this.ensureAccessToOrganization(organizationId)
        const admin = await this.isOrganizationAdmin(organizationId)
        return (await this.candidatesOf(organizationId)).map(candidate => (admin && !candidate.system ? toDetail(candidate) : toSummary(candidate)))
    }

    async create(organizationId: Id, input: AiModelInput): Promise<AiModelDetail> {
        await this.ensureOrganizationAdmin(organizationId)
        const name = input.name?.trim()
        if (!name || name.length > AI_MODEL_NAME_MAX_LENGTH) throw invalid(`name is required, at most ${AI_MODEL_NAME_MAX_LENGTH} characters`, ["name"])
        const provider = input.provider
        ensureProvider(provider)
        const config = withUnchangedSecrets(provider, normalizeConfig(provider, input.config))
        const model = input.model?.trim() || undefined
        validateAiModel(provider, model, config, azureOpenAiHostSuffixes(this.config))
        await this.ensureNameFree(organizationId, name)

        const document = await this.saved(
            organizationId,
            new AiModel({ organizationId: toObjectId(organizationId), name, provider, modelId: model, config, maxEffort: input.maxEffort ?? undefined, isDefault: Boolean(input.isDefault) })
        )
        return toDetail({ settings: settingsOf(document), isDefault: document.isDefault, system: false, document })
    }

    /** A partial update: what the body leaves out stays as it is, the credentials sent back as the placeholder too. */
    async update(organizationId: Id, aiModelId: string, input: AiModelInput): Promise<AiModelDetail> {
        if (aiModelId === SYSTEM_AI_MODEL_ID) throw systemReadOnly()
        await this.ensureOrganizationAdmin(organizationId)
        const document = await AiModel.findOne({ _id: toObjectId(aiModelId), organizationId: toObjectId(organizationId) })
        if (!document) throw new EntityNotFoundError(aiModelId)

        const name = input.name === undefined ? document.name : input.name.trim()
        if (!name || name.length > AI_MODEL_NAME_MAX_LENGTH) throw invalid(`name is required, at most ${AI_MODEL_NAME_MAX_LENGTH} characters`, ["name"])
        const provider = input.provider ?? document.provider
        ensureProvider(provider)
        let config: AiModelConfig
        if (input.config !== undefined) {
            config = withUnchangedSecrets(provider, normalizeConfig(provider, input.config), document)
        } else if (provider !== document.provider) {
            // The stored keys were given for the other provider: they are never sent to this one
            config = withoutSecrets(normalizeConfig(provider, document.config))
            const retype = AI_MODEL_SECRET_KEYS.filter(key => AI_MODEL_CONFIG_KEYS[provider].required.includes(key))
            if (retype.length) throw secretRequired(retype)
        } else {
            config = normalizeConfig(provider, document.config)
        }
        const model = input.model === undefined ? document.modelId : input.model?.trim() || undefined
        validateAiModel(provider, model, config, azureOpenAiHostSuffixes(this.config))
        await this.ensureNameFree(organizationId, name, document._id)

        document.name = name
        document.provider = provider
        document.modelId = model
        // Mixed: mongoose does not see a change inside it unless told
        document.config = config
        document.markModified("config")
        if (input.maxEffort !== undefined) document.maxEffort = input.maxEffort ?? undefined
        if (input.isDefault !== undefined) document.isDefault = input.isDefault
        const updated = await this.saved(organizationId, document)
        return toDetail({ settings: settingsOf(updated), isDefault: updated.isDefault, system: false, document: updated })
    }

    /** Deletes the AI and takes it out of every project restricted to it: one left with none has AI off. */
    async delete(organizationId: Id, aiModelId: string): Promise<void> {
        if (aiModelId === SYSTEM_AI_MODEL_ID) throw systemReadOnly()
        await this.ensureOrganizationAdmin(organizationId)
        const document = await AiModel.findOne({ _id: toObjectId(aiModelId), organizationId: toObjectId(organizationId) })
        if (!document) throw new EntityNotFoundError(aiModelId)
        await runInTransaction(async session => {
            await AiModel.deleteOne({ _id: document._id }, { session })
            await Project.updateMany({ organizationId: toObjectId(organizationId), aiModelIds: aiModelId }, { $pull: { aiModelIds: aiModelId } }, { session })
        })
        forgetLlmClient(aiModelId)
    }

    /** Which AIs each project of the organization may use, for the table of the organization page. */
    async projectAccess(organizationId: Id): Promise<ProjectAiModelAccess[]> {
        await this.ensureOrganizationAdmin(organizationId)
        const projects = await Project.find({ organizationId: toObjectId(organizationId) }, { name: 1, aiModelIds: 1 })
        return projects
            .map(project => ({ projectId: String(project._id), name: project.name, aiModelIds: Array.isArray(project.aiModelIds) ? [...project.aiModelIds] : null }))
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
    }

    /**
     * Restricts a project to some AIs of its organization (`system` included), or gives it all of them
     * back with null. Who pays for the AIs decides: the administrators of the organization.
     */
    async setProjectAccess(projectId: string, aiModelIds: string[] | null): Promise<{ aiModelIds: string[] | null }> {
        const project = await Project.findById(toObjectId(projectId), { organizationId: 1 })
        if (!project) throw new EntityNotFoundError(projectId)
        await this.ensureOrganizationAdmin(project.organizationId)
        if (aiModelIds === null) {
            await Project.updateOne({ _id: project._id }, { $unset: { aiModelIds: 1 } })
            return { aiModelIds: null }
        }
        const ids = [...new Set(aiModelIds)]
        const known = new Set((await this.candidatesOf(project.organizationId)).map(candidate => candidate.settings.id))
        const unknown = ids.find(id => !known.has(id))
        if (unknown) throw notAvailable(unknown)
        await Project.updateOne({ _id: project._id }, { $set: { aiModelIds: ids } })
        return { aiModelIds: ids }
    }

    /** The AIs a member of the project may choose from, and the one preselected. */
    async availableForProject(projectId: string): Promise<AvailableAiModels> {
        await this.ensureAccessToProject(projectId)
        return toAvailable(await this.availableToProject(projectId))
    }

    /** The AIs of the organization, for what happens before a project exists: the wizard's draft. */
    async availableForOrganization(organizationId: Id): Promise<AvailableAiModels> {
        await this.ensureAccessToOrganization(organizationId)
        return toAvailable(await this.candidatesOf(organizationId))
    }

    /**
     * The AI a request on the project runs on: `aiModelId` when given (it has to be one the project may
     * use), else `preferredId` while the project still may use it (a follow-up keeps its parent's AI),
     * else the default. A project without any AI answers as AI off.
     */
    async resolveForProject(projectId: Id, aiModelId?: string, preferredId?: string): Promise<ResolvedAiModel> {
        await this.ensureAccessToProject(projectId)
        return this.resolve(await this.availableToProject(projectId), aiModelId, preferredId)
    }

    async resolveForOrganization(organizationId: Id, aiModelId?: string): Promise<ResolvedAiModel> {
        await this.ensureAccessToOrganization(organizationId)
        return this.resolve(await this.candidatesOf(organizationId), aiModelId)
    }
}

export default AiModelService
