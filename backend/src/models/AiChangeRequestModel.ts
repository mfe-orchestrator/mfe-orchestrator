import mongoose, { Document, ObjectId, Schema } from "mongoose"
import { LLM_EFFORTS, LlmEffort } from "../service/llm/types"

export enum AiChangeStatus {
    /** Created, waiting for the working copy (another request may be holding it). */
    PENDING = "PENDING",
    /** The agent is reading and editing the working copy. */
    RUNNING = "RUNNING",
    /** The agent is done: the proposal waits for the user. */
    PROPOSED = "PROPOSED",
    /** Pushing the proposal onto the base branch. */
    APPLYING = "APPLYING",
    /** On the base branch. */
    APPLIED = "APPLIED",
    DISCARDED = "DISCARDED",
    FAILED = "FAILED"
}

export type AiChangeFileAction = "create" | "update" | "delete"

export interface IAiChangeFile {
    path: string
    action: AiChangeFileAction
    /** Blob at the base commit: apply refuses to overwrite a file that changed on the remote since. */
    baseBlobOid?: string
    originalContent?: string
    proposedContent?: string
}

export interface IAiChangeEvent {
    at: Date
    /** `tool` for a step of the agent, `info` for the job itself, `text` for what the model said, `thinking` for the summary of its reasoning. */
    kind: "info" | "tool" | "text" | "thinking"
    message: string
}

export interface IAiChangeUsage {
    inputTokens: number
    /** The part of `inputTokens` read from the prompt cache. */
    cachedInputTokens: number
    outputTokens: number
}

export interface IAiChangeRequest extends Document<ObjectId> {
    projectId: Schema.Types.ObjectId
    /** The repository the request changes belongs to a microfrontend or to a service: exactly one of the two is set. */
    microfrontendId?: Schema.Types.ObjectId
    serviceId?: Schema.Types.ObjectId
    userId: Schema.Types.ObjectId
    /** The agent run that produced this request: one job proposes a change on one or more repositories. */
    jobId?: Schema.Types.ObjectId
    /** How many repositories the job worked on: its usage is shared among them. */
    jobRepositoryCount?: number
    /** The effort the job's agent reasoned with, shown next to the usage it explains. */
    effort: LlmEffort
    /** The AI the job's agent ran on, as on the job. */
    aiModelId?: string
    /** The proposal this request refines: the agent started from its files, and this one replaces it once proposed. */
    parentId?: Schema.Types.ObjectId
    /**
     * The conversation the request is a message of: the first job of its chain of follow-ups (the jobs'
     * `rootJobId`), or the request itself for one made before jobs existed. Always set.
     */
    conversationId: Schema.Types.ObjectId
    prompt: string
    baseBranch: string
    baseCommit?: string
    status: AiChangeStatus
    files: IAiChangeFile[]
    summary?: string
    events: IAiChangeEvent[]
    /** The feature branch the proposal is pushed on: named by the first message of the conversation, every follow-up force-pushes it. */
    branch?: string
    /** The proposal's commit on `branch`, then, once applied, the commit on the base branch. */
    commit?: string
    /** Set when the proposal could not be pushed on its branch: it can still be applied, and the pull request pushes it again. */
    pushError?: string
    pullRequestUrl?: string
    /** Set when the pull request could not be opened. */
    pullRequestError?: string
    error?: string
    /** The usage of the whole job, the same on every request of it: one agent worked on all its repositories. */
    usage: IAiChangeUsage
    /** Proposals nobody acted upon are removed by a TTL index on this date. */
    expiresAt?: Date
    createdAt: Date
    updatedAt: Date
}

/** How many progress lines a request keeps: enough to follow it, bounded so a looping agent cannot grow the document. */
export const AI_CHANGE_MAX_EVENTS = 200

const fileSchema = new Schema<IAiChangeFile>(
    {
        path: { type: String, required: true },
        action: { type: String, enum: ["create", "update", "delete"], required: true },
        baseBlobOid: { type: String },
        originalContent: { type: String },
        proposedContent: { type: String }
    },
    { _id: false }
)

export const aiChangeEventSchema = new Schema<IAiChangeEvent>(
    {
        at: { type: Date, required: true },
        kind: { type: String, enum: ["info", "tool", "text", "thinking"], required: true },
        message: { type: String, required: true }
    },
    { _id: false }
)

const aiChangeRequestSchema = new Schema<IAiChangeRequest>(
    {
        projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
        microfrontendId: { type: Schema.Types.ObjectId, ref: "Microfrontend", index: true },
        serviceId: { type: Schema.Types.ObjectId, ref: "Service", index: true },
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        jobId: { type: Schema.Types.ObjectId, ref: "AiChangeJob", index: true },
        jobRepositoryCount: { type: Number },
        // Requests from before the effort could be chosen ran at high: they read so.
        effort: { type: String, enum: [...LLM_EFFORTS], default: "high" },
        aiModelId: { type: String },
        parentId: { type: Schema.Types.ObjectId, ref: "AiChangeRequest", index: true },
        conversationId: { type: Schema.Types.ObjectId, required: true, index: true },
        prompt: { type: String, required: true, maxlength: 8_000 },
        baseBranch: { type: String, required: true },
        baseCommit: { type: String },
        status: { type: String, enum: Object.values(AiChangeStatus), default: AiChangeStatus.PENDING, required: true },
        files: { type: [fileSchema], default: [] },
        summary: { type: String },
        events: { type: [aiChangeEventSchema], default: [] },
        branch: { type: String },
        commit: { type: String },
        pushError: { type: String },
        pullRequestUrl: { type: String },
        pullRequestError: { type: String },
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

aiChangeRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

// A request changes the repository of one component: a microfrontend or a service, never both, never none.
aiChangeRequestSchema.pre("validate", function () {
    if (Boolean(this.microfrontendId) === Boolean(this.serviceId)) {
        this.invalidate("microfrontendId", "Exactly one of microfrontendId and serviceId must be set")
    }
})

const AiChangeRequest = mongoose.model<IAiChangeRequest>("AiChangeRequest", aiChangeRequestSchema)
export default AiChangeRequest
