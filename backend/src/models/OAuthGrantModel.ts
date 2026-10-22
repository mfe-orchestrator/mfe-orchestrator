import mongoose, { Document, ObjectId, Schema } from "mongoose"

/** Why a grant stopped working, shown to nobody but kept for whoever investigates later. */
export enum OAuthGrantRevocationReason {
    /** Revoked from the console, by its user or by a project owner */
    CONSOLE = "console",
    /** The client called the revocation endpoint */
    CLIENT = "client",
    /** A refresh token was presented twice: one of the two copies is in someone else's hands */
    REFRESH_TOKEN_REUSE = "refresh_token_reuse",
    /** An authorization code was exchanged twice */
    CODE_REUSE = "code_reuse",
    /** The user no longer belongs to the project the grant is bound to */
    MEMBERSHIP_LOST = "membership_lost"
}

/**
 * What a user allowed one MCP client to do on the projects picked at consent.
 *
 * Access and refresh tokens are only proofs of a grant: every MCP request reloads it, so revoking
 * it here takes effect on the next call rather than when the last access token expires.
 */
export interface IOAuthGrant extends Document<ObjectId> {
    userId: Schema.Types.ObjectId
    /** The projects shared with the client, one or more. */
    projectIds: Schema.Types.ObjectId[]
    /**
     * Grants issued before a grant could cover several projects carry this instead. Read through
     * `projectIdsOfGrant`, and rewritten to `projectIds` the first time such a grant is used.
     */
    projectId?: Schema.Types.ObjectId
    clientId: string
    scopes: string[]
    /**
     * Set at consent when write access was given under the wording that mentions creating projects.
     * Grants approved before that wording existed lack it, and cannot create projects until the user
     * reconnects the client: what they approved said nothing about it.
     */
    canCreateProjects?: boolean
    /**
     * The projects the client created itself through `project_create`, also listed in `projectIds`.
     * They are added to every request even when the access token was minted before they existed.
     */
    createdProjectIds?: Schema.Types.ObjectId[]
    lastUsedAt?: Date
    revokedAt?: Date
    revokedReason?: OAuthGrantRevocationReason
    /** Hard cap: the user re-consents after 90 days however actively the client refreshed. */
    expiresAt: Date
    /** When the TTL index drops the row, a while after it stopped being usable. */
    purgeAt: Date
    createdAt: Date
    updatedAt: Date
}

const oauthGrantSchema = new Schema<IOAuthGrant>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },
        projectIds: {
            type: [Schema.Types.ObjectId],
            ref: "Project",
            index: true
        },
        projectId: {
            type: Schema.Types.ObjectId,
            ref: "Project",
            required: false,
            index: true
        },
        clientId: {
            type: String,
            required: true
        },
        scopes: {
            type: [String],
            required: true
        },
        canCreateProjects: {
            type: Boolean,
            required: false
        },
        createdProjectIds: {
            type: [Schema.Types.ObjectId],
            ref: "Project",
            required: false
        },
        lastUsedAt: {
            type: Date,
            required: false
        },
        revokedAt: {
            type: Date,
            required: false
        },
        revokedReason: {
            type: String,
            enum: Object.values(OAuthGrantRevocationReason),
            required: false
        },
        expiresAt: {
            type: Date,
            required: true
        },
        purgeAt: {
            type: Date,
            required: true
        }
    },
    {
        timestamps: true
    }
)

oauthGrantSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 })

const OAuthGrant = mongoose.model<IOAuthGrant>("OAuthGrant", oauthGrantSchema)
export default OAuthGrant
