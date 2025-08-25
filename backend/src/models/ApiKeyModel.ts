import mongoose, { ObjectId, Document, Schema, Types } from "mongoose"
import bcrypt from "bcryptjs"

export enum ApiKeyRole {
    VIEWER = "VIEWER",
    MANAGER = "MANAGER"
}

export enum ApiKeyStatus {
    ACTIVE = "ACTIVE",
    INACTIVE = "INACTIVE"
}

export interface IApiKey extends Document<ObjectId> {
    projectId: Types.ObjectId
    apiKey: string
    salt: string
    role: ApiKeyRole
    expirationDate: Date
    status: ApiKeyStatus
}

const apiKeySchema = new Schema<IApiKey>(
    {
        projectId: {
            type: Schema.Types.ObjectId,
            ref: "Project",
            required: true,
            index: true
        },
        apiKey: {
            type: String,
            required: true
        },
        salt: {
            type: String,
            required: true
        },
        role: {
            type: String,
            enum: Object.values(ApiKeyRole),
            default: ApiKeyRole.VIEWER,
            required: true
        },
        expirationDate: {
            type: Date,
            required: false
        },
        status: {
            type: String,
            enum: Object.values(ApiKeyStatus),
            default: ApiKeyStatus.ACTIVE,
            required: true
        }
    },
    {
        timestamps: true
    }
)

apiKeySchema.pre<IApiKey>("save", async function (next) {
    if (this.isModified("apiKey")) {
        const salt = await bcrypt.genSalt(10)
        this.salt = salt
        this.apiKey = await bcrypt.hash(this.apiKey, salt)
    }
    next()
})

const ApiKey = mongoose.model<IApiKey>("ApiKey", apiKeySchema)
export default ApiKey
