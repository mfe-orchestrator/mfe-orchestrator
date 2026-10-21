import mongoose, { Document, ObjectId, Schema } from "mongoose"
import { AI_MODEL_SECRET_KEYS, AiModelConfig } from "../service/llm"
import { LLM_EFFORTS, LlmEffort, LlmProvider } from "../service/llm/types"
import { encryptedFields } from "../utils/encryptedFieldsPlugin"

/**
 * An AI an organization defines: a provider, the model it serves and the credentials to reach it.
 * Every project of the organization may use it, unless the project is restricted to some AIs
 * (`Project.aiModelIds`).
 */
export interface IAiModel extends Document<ObjectId> {
    organizationId: Schema.Types.ObjectId
    name: string
    provider: LlmProvider
    /**
     * The model id or the deployment name; left out, the provider's default (Claude only). Not stored as
     * `model`, which every mongoose document already has as a method.
     */
    modelId?: string
    config: AiModelConfig
    maxEffort?: LlmEffort
    /** The AI preselected in the console: at most one per organization. */
    isDefault: boolean
    createdAt: Date
    updatedAt: Date
}

export const AI_MODEL_NAME_MAX_LENGTH = 100

const aiModelSchema = new Schema<IAiModel>(
    {
        organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
        name: { type: String, required: true, trim: true, maxlength: AI_MODEL_NAME_MAX_LENGTH },
        provider: { type: String, enum: Object.values(LlmProvider), required: true },
        modelId: { type: String, trim: true },
        config: { type: Schema.Types.Mixed, required: true },
        maxEffort: { type: String, enum: [...LLM_EFFORTS] },
        isDefault: { type: Boolean, default: false }
    },
    { timestamps: true, minimize: false }
)

// Two AIs of an organization told apart by the case of their name would look the same in every selector.
aiModelSchema.index({ organizationId: 1, name: 1 }, { unique: true, collation: { locale: "en", strength: 2 } })
// At most one default per organization, even when two administrators mark one at the same time.
aiModelSchema.index({ organizationId: 1, isDefault: 1 }, { unique: true, partialFilterExpression: { isDefault: true } })

aiModelSchema.plugin(encryptedFields, { model: "AiModel", paths: AI_MODEL_SECRET_KEYS.map(key => `config.${key}`) })

const AiModel = mongoose.model<IAiModel>("AiModel", aiModelSchema)
export default AiModel
