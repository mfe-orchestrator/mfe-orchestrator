import mongoose, { Document, ObjectId, Schema } from "mongoose"

/**
 * One link of a refresh token chain.
 *
 * Every refresh hands out a new token and marks the presented one used. A used token that comes
 * back means two parties hold the chain, and the whole grant is revoked (RFC 9700 §4.14.2).
 */
export interface IOAuthRefreshToken extends Document<ObjectId> {
    tokenHash: string
    grantId: Schema.Types.ObjectId
    clientId: string
    parentId?: Schema.Types.ObjectId
    usedAt?: Date
    /** Idle lifetime: a client that does not refresh for 30 days has to ask the user again. */
    expiresAt: Date
    createdAt: Date
}

const oauthRefreshTokenSchema = new Schema<IOAuthRefreshToken>(
    {
        tokenHash: {
            type: String,
            required: true,
            unique: true
        },
        grantId: {
            type: Schema.Types.ObjectId,
            ref: "OAuthGrant",
            required: true,
            index: true
        },
        clientId: {
            type: String,
            required: true
        },
        parentId: {
            type: Schema.Types.ObjectId,
            ref: "OAuthRefreshToken",
            required: false
        },
        usedAt: {
            type: Date,
            required: false
        },
        expiresAt: {
            type: Date,
            required: true
        }
    },
    {
        timestamps: { createdAt: true, updatedAt: false }
    }
)

oauthRefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

const OAuthRefreshToken = mongoose.model<IOAuthRefreshToken>("OAuthRefreshToken", oauthRefreshTokenSchema)
export default OAuthRefreshToken
