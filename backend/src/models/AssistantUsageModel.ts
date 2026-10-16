import mongoose, { Schema } from "mongoose"

/** The tokens of one assistant answer, every model round included: what the assistant costs, per user and project. */
export interface IAssistantUsage {
    userId: Schema.Types.ObjectId
    projectId: Schema.Types.ObjectId
    provider?: string
    stopReason: string
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
        stopReason: { type: String, required: true },
        inputTokens: { type: Number, default: 0 },
        cachedInputTokens: { type: Number, default: 0 },
        outputTokens: { type: Number, default: 0 }
    },
    { timestamps: { createdAt: true, updatedAt: false } }
)

const AssistantUsage = mongoose.model<IAssistantUsage>("AssistantUsage", assistantUsageSchema)
export default AssistantUsage
