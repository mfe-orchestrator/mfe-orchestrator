import mongoose, { ObjectId, Document, Schema, Types } from "mongoose"
import bcrypt from "bcryptjs"

export enum ApiKeyRole {
    VIEWER = "VIEWER",
    MANAGER = "MANAGER"
}

export interface IApiKey extends Document<ObjectId> {
    _id: ObjectId
    projectId: Types.ObjectId
    apiKey: string
    salt: string
    role: ApiKeyRole
    expirationDate: Date
}

const apiKeySchema = new Schema<IApiKey>(
    {
        _id: {
            type: Schema.Types.ObjectId,
            auto: true
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
