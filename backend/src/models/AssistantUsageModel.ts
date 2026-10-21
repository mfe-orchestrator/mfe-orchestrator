import mongoose, { Schema } from "mongoose"
import { LLM_EFFORTS, LlmEffort } from "../service/llm/types"

/** The tokens of one assistant answer, every model round included: what the assistant costs, per user and project. */
export interface IAssistantUsage {
    userId: Schema.Types.ObjectId
    projectId: Schema.Types.ObjectId
    provider?: string
    /** The AI that answered: an id of the organization's AIs, or `system`. */
    aiModelId?: string
    stopReason: string
    /** The effort the answer was asked with: more effort, more tokens. */
    effort?: LlmEffort
    inputTokens: number
    cachedInputTokens: number
    outputTokens: number
    createdAt: Date
}

const assistantUsageSchema = new Schema<IAssistantUsage>(
    {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
        projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
        provider: { type: String },
        aiModelId: { type: String },
        stopReason: { type: String, required: true },
        effort: { type: String, enum: [...LLM_EFFORTS] },
        inputTokens: { type: Number, default: 0 },
        cachedInputTokens: { type: Number, default: 0 },
        outputTokens: { type: Number, default: 0 }
    },
    { timestamps: { createdAt: true, updatedAt: false } }
)

const AssistantUsage = mongoose.model<IAssistantUsage>("AssistantUsage", assistantUsageSchema)
export default AssistantUsage
