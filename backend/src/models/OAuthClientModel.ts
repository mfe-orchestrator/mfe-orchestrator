import mongoose, { Document, ObjectId, Schema } from "mongoose"

/**
 * How the authorization server learnt about a MCP client.
 *
 * DCR: the client registered itself (RFC 7591) and every field is self-asserted, so the consent
 * page marks it unverified. CIMD: the `client_id` is an https URL serving the metadata, so the
 * client is at least whoever controls that domain.
 */
export enum OAuthClientRegistrationType {
    DCR = "dcr",
    CIMD = "cimd"
}

export interface IOAuthClient extends Document<ObjectId> {
    clientId: string
    registrationType: OAuthClientRegistrationType
    clientName: string
    redirectUris: string[]
    clientUri?: string
    logoUri?: string
    softwareId?: string
    softwareVersion?: string
    /** CIMD only: when the cached metadata document has to be fetched again. */
    metadataExpiresAt?: Date
    /**
     * Set at registration and cleared by the first approved grant. Anyone can register a client, so
     * one nobody ever authorized is dropped by the TTL index instead of piling up forever.
     */
    unusedExpiresAt?: Date
    createdAt: Date
    updatedAt: Date
}

const oauthClientSchema = new Schema<IOAuthClient>(
    {
        clientId: {
            type: String,
            required: true,
            unique: true
        },
        registrationType: {
            type: String,
            enum: Object.values(OAuthClientRegistrationType),
            required: true
        },
        clientName: {
            type: String,
            required: true,
            trim: true
        },
        redirectUris: {
            type: [String],
            required: true
        },
        clientUri: {
            type: String,
            required: false
        },
        logoUri: {
            type: String,
            required: false
        },
        softwareId: {
            type: String,
            required: false
        },
        softwareVersion: {
            type: String,
            required: false
        },
        metadataExpiresAt: {
            type: Date,
            required: false
        },
        unusedExpiresAt: {
            type: Date,
            required: false
        }
    },
    {
        timestamps: true
    }
)

oauthClientSchema.index({ unusedExpiresAt: 1 }, { expireAfterSeconds: 0 })

const OAuthClient = mongoose.model<IOAuthClient>("OAuthClient", oauthClientSchema)
export default OAuthClient
