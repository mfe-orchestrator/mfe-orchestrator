import mongoose, { Document, ObjectId, Schema } from "mongoose"

export enum AiChangeStatus {
    /** Created, waiting for the working copy (another request may be holding it). */
    PENDING = "PENDING",
    /** The agent is reading and editing the working copy. */
    RUNNING = "RUNNING",
    /** The agent is done: the proposal waits for the user. */
    PROPOSED = "PROPOSED",
    /** Committing, pushing and opening the pull request. */
    APPLYING = "APPLYING",
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
    /** `tool` for a step of the agent, `info` for the job itself, `text` for what the model said. */
    kind: "info" | "tool" | "text"
    message: string
}

export interface IAiChangeUsage {
    inputTokens: number
    outputTokens: number
}

export interface IAiChangeRequest extends Document<ObjectId> {
    projectId: Schema.Types.ObjectId
    microfrontendId: Schema.Types.ObjectId
    userId: Schema.Types.ObjectId
    prompt: string
    baseBranch: string
    baseCommit?: string
    status: AiChangeStatus
    files: IAiChangeFile[]
    summary?: string
    events: IAiChangeEvent[]
    branch?: string
    commit?: string
    pullRequestUrl?: string
    /** Set when the branch was pushed but the pull request could not be opened. */
    pullRequestError?: string
    error?: string
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

const eventSchema = new Schema<IAiChangeEvent>(
    {
        at: { type: Date, required: true },
        kind: { type: String, enum: ["info", "tool", "text"], required: true },
        message: { type: String, required: true }
    },
    { _id: false }
)

const aiChangeRequestSchema = new Schema<IAiChangeRequest>(
    {
        projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
        microfrontendId: { type: Schema.Types.ObjectId, ref: "Microfrontend", required: true, index: true },
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        prompt: { type: String, required: true, maxlength: 8_000 },
        baseBranch: { type: String, required: true },
        baseCommit: { type: String },
        status: { type: String, enum: Object.values(AiChangeStatus), default: AiChangeStatus.PENDING, required: true },
        files: { type: [fileSchema], default: [] },
        summary: { type: String },
        events: { type: [eventSchema], default: [] },
        branch: { type: String },
        commit: { type: String },
        pullRequestUrl: { type: String },
        pullRequestError: { type: String },
        error: { type: String },
        usage: {
            inputTokens: { type: Number, default: 0 },
            outputTokens: { type: Number, default: 0 }
        },
        expiresAt: { type: Date }
    },
    { timestamps: true }
)

aiChangeRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

const AiChangeRequest = mongoose.model<IAiChangeRequest>("AiChangeRequest", aiChangeRequestSchema)
export default AiChangeRequest
