import mongoose, { Document, ObjectId, Schema } from "mongoose"

/**
 * An `/oauth/authorize` call parked while the user looks at the consent page.
 *
 * The browser only ever carries an opaque handle: everything the client asked for stays here, so
 * the consent page cannot be fed a different redirect URI or challenge than the one validated.
 */
export interface IOAuthAuthorizationRequest extends Document<ObjectId> {
    /** SHA-256 of the handle in the consent URL: a database dump does not reveal live handles. */
    handleHash: string
    clientId: string
    redirectUri: string
    /**
     * Whether the client sent redirect_uri to /authorize. RFC 6749 §4.1.3: only then must the token
     * request repeat it; a client relying on its single registered URI may leave it out of both.
     */
    redirectUriProvided: boolean
    state?: string
    codeChallenge: string
    scopes: string[]
    resource: string
    /**
     * The console user who opened the consent page first. The handle travels in a URL, so whoever
     * else gets hold of it (history, a shared screenshot) sees a 404 instead of the request.
     */
    boundUserId?: Schema.Types.ObjectId
    expiresAt: Date
    createdAt: Date
}

const oauthAuthorizationRequestSchema = new Schema<IOAuthAuthorizationRequest>(
    {
        handleHash: {
            type: String,
            required: true,
            unique: true
        },
        clientId: {
            type: String,
            required: true
        },
        redirectUri: {
            type: String,
            required: true
        },
        redirectUriProvided: {
            type: Boolean,
            default: true
        },
        state: {
            type: String,
            required: false
        },
        codeChallenge: {
            type: String,
            required: true
        },
        scopes: {
            type: [String],
            required: true
        },
        resource: {
            type: String,
            required: true
        },
        boundUserId: {
            type: Schema.Types.ObjectId,
            ref: "User",
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

oauthAuthorizationRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

const OAuthAuthorizationRequest = mongoose.model<IOAuthAuthorizationRequest>("OAuthAuthorizationRequest", oauthAuthorizationRequestSchema)
export default OAuthAuthorizationRequest
