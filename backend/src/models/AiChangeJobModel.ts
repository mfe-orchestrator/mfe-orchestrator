import mongoose, { Document, ObjectId, Schema } from "mongoose"
import { LLM_EFFORTS, LlmEffort, LlmMessage } from "../service/llm/types"
import { aiChangeEventSchema, IAiChangeEvent, IAiChangeUsage } from "./AiChangeRequestModel"

export enum AiJobStatus {
    /** Created, waiting for the working copies (another job may be holding one). */
    PENDING = "PENDING",
    /** The agent is reading and editing the working copies. */
    RUNNING = "RUNNING",
    /** The agent is done: each repository has its proposal, reviewed on its own request. */
    DONE = "DONE",
    FAILED = "FAILED"
}

/**
 * `global` works on every microfrontend and service of the project with a repository, `domain` on those of one
 * functional domain, its frontend and its backend together, `selection` on the ones the user picked.
 */
export type AiJobScope = "global" | "domain" | "selection"

/**
 * One run of the AI agent over one or more repositories of a project.
 *
 * The job is the execution (log, usage, summary); what is reviewed and applied is the
 * AiChangeRequest it creates for each repository. A follow-up is a child job that starts
 * from the proposals of its parent.
 */
export interface IAiChangeJob extends Document<ObjectId> {
    projectId: Schema.Types.ObjectId
    userId: Schema.Types.ObjectId
    /** The job this follow-up refines. */
    parentJobId?: Schema.Types.ObjectId
    /** The first job of the chain, itself included: what the console groups a conversation by. */
    rootJobId: Schema.Types.ObjectId
    prompt: string
    scope: AiJobScope
    /** The functional domain the job was asked from: its follow-ups keep it, and the agent is told about it. */
    domainId?: Schema.Types.ObjectId
    /** The repositories the agent works on, in the order they are shown. */
    microfrontendIds: Schema.Types.ObjectId[]
    /** The services among them, shown after the microfrontends. */
    serviceIds: Schema.Types.ObjectId[]
    status: AiJobStatus
    /** How hard the agent reasons: the user's choice, else the parent's for a follow-up, else `high`. */
    effort: LlmEffort
    /** The AI the agent ran on: an id of the organization's AIs, or `system`. Unset on jobs from before AIs could be chosen. */
    aiModelId?: string
    events: IAiChangeEvent[]
    summary?: string
    /**
     * The conversation of the agent with the user, up to and including this job, compacted: a
     * follow-up on the same repositories carries on from it instead of starting over.
     */
    transcript?: LlmMessage[]
    error?: string
    usage: IAiChangeUsage
    /** Finished jobs nobody applied are removed by a TTL index on this date, like their proposals. */
    expiresAt?: Date
    createdAt: Date
    updatedAt: Date
}

const aiChangeJobSchema = new Schema<IAiChangeJob>(
    {
        projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        parentJobId: { type: Schema.Types.ObjectId, ref: "AiChangeJob" },
        rootJobId: { type: Schema.Types.ObjectId, ref: "AiChangeJob", required: true, index: true },
        prompt: { type: String, required: true, maxlength: 8_000 },
        scope: { type: String, enum: ["global", "domain", "selection"], required: true },
        domainId: { type: Schema.Types.ObjectId, ref: "Domain" },
        microfrontendIds: { type: [{ type: Schema.Types.ObjectId, ref: "Microfrontend" }], default: [] },
        serviceIds: { type: [{ type: Schema.Types.ObjectId, ref: "Service" }], default: [] },
        status: { type: String, enum: Object.values(AiJobStatus), default: AiJobStatus.PENDING, required: true },
        // Jobs from before the effort could be chosen ran at high: they read so.
        effort: { type: String, enum: [...LLM_EFFORTS], default: "high" },
        aiModelId: { type: String },
        events: { type: [aiChangeEventSchema], default: [] },
        summary: { type: String },
        transcript: { type: [Schema.Types.Mixed], default: undefined },
        error: { type: String },
        usage: {
            inputTokens: { type: Number, default: 0 },
            cachedInputTokens: { type: Number, default: 0 },
            outputTokens: { type: Number, default: 0 }
        },
        expiresAt: { type: Date }
    },
    { timestamps: true }
)

aiChangeJobSchema.index({ projectId: 1, userId: 1, createdAt: -1 })
aiChangeJobSchema.index({ projectId: 1, status: 1 })
aiChangeJobSchema.index({ projectId: 1, domainId: 1, createdAt: -1 })
aiChangeJobSchema.index({ parentJobId: 1 })
aiChangeJobSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

const AiChangeJob = mongoose.model<IAiChangeJob>("AiChangeJob", aiChangeJobSchema)
export default AiChangeJob
