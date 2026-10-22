import mongoose, { Document, ObjectId, Schema } from "mongoose"

export interface IOAuthAuthorizationCode extends Document<ObjectId> {
    codeHash: string
    grantId: Schema.Types.ObjectId
    clientId: string
    redirectUri: string
    /**
     * Whether the client sent redirect_uri to /authorize. RFC 6749 §4.1.3: only then must the token
     * request repeat it; a client relying on its single registered URI may leave it out of both.
     */
    redirectUriProvided: boolean
    codeChallenge: string
    resource: string
    scopes: string[]
    /** Usable until then: 60 seconds after consent. */
    expiresAt: Date
    /**
     * Set by the one exchange that wins. Kept rather than deleting the code, because a second
     * exchange of the same code means it leaked, and that has to revoke the grant it produced.
     */
    consumedAt?: Date
    /** When the TTL index drops the row: well after expiry, so a late replay is still recognised. */
    purgeAt: Date
}

const oauthAuthorizationCodeSchema = new Schema<IOAuthAuthorizationCode>({
    codeHash: {
        type: String,
        required: true,
        unique: true
    },
    grantId: {
        type: Schema.Types.ObjectId,
        ref: "OAuthGrant",
        required: true
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
    codeChallenge: {
        type: String,
        required: true
    },
    resource: {
        type: String,
        required: true
    },
    scopes: {
        type: [String],
        required: true
    },
    expiresAt: {
        type: Date,
        required: true
    },
    consumedAt: {
        type: Date,
        required: false
    },
    purgeAt: {
        type: Date,
        required: true
    }
})

oauthAuthorizationCodeSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 })

const OAuthAuthorizationCode = mongoose.model<IOAuthAuthorizationCode>("OAuthAuthorizationCode", oauthAuthorizationCodeSchema)
export default OAuthAuthorizationCode
