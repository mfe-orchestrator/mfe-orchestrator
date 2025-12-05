import bcrypt from "bcryptjs"
import mongoose, { Document, ObjectId, Schema } from "mongoose"

export enum ApiKeyRole {
    VIEWER = "VIEWER",
    MANAGER = "MANAGER"
}

export enum ApiKeyStatus {
    ACTIVE = "ACTIVE",
    INACTIVE = "INACTIVE"
}

export interface IApiKey {
    name: string
    projectId: Schema.Types.ObjectId
    apiKey: string
    role: ApiKeyRole
    expiresAt: Date
    status: ApiKeyStatus
}

export type IApiKeyDocument = IApiKey &
    Document<ObjectId> & {
        compareApiKey: (candidateApiKey: string) => Promise<boolean>
        toFrontendObject: () => IApiKey
    }

const apiKeySchema = new Schema<IApiKeyDocument>(
    {
        name: {
            type: String,
            required: true
        },
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
        role: {
            type: String,
            enum: Object.values(ApiKeyRole),
            default: ApiKeyRole.VIEWER,
            required: true
        },
        expiresAt: {
            type: Date,
            required: true
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

apiKeySchema.pre<IApiKeyDocument>("save", async function () {
    if (this.isModified("apiKey")) {
        this.apiKey = await bcrypt.hash(this.apiKey, 10)
    }
})

apiKeySchema.methods.compareApiKey = async function (candidateApiKey: string): Promise<boolean> {
    return bcrypt.compare(candidateApiKey, this.apiKey)
}

apiKeySchema.methods.toFrontendObject = function (): IApiKey {
    const obj = this.toObject()
    delete obj.apiKey
    delete obj.__v
    return obj
}

const ApiKey = mongoose.model<IApiKeyDocument>("ApiKey", apiKeySchema)
export default ApiKey
