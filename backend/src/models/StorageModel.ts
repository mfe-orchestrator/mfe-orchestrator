import mongoose, { ObjectId, Document, Schema } from "mongoose"

export enum StorageType {
    AZURE = "AZURE",
    AWS = "AWS",
    GOOGLE = "GOOGLE"
}

export interface IStorage extends Document<ObjectId> {
    _id: ObjectId
    type: StorageType
    projectId: ObjectId
    apiKey: string
    clientId: string
    clientSecret: string
    tenantId: string
}

const storageSchema = new Schema<IStorage>(
    {
        _id: {
            type: Schema.Types.ObjectId,
            auto: true
        },
        type: {
            type: String,
            enum: Object.values(StorageType),
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
        clientId: {
            type: String,
            required: true
        },
        clientSecret: {
            type: String,
            required: true
        },
        tenantId: {
            type: String,
            required: true
        }
    },
    {
        timestamps: true
    }
)

const Storage = mongoose.model<IStorage>("Storage", storageSchema)
export default Storage
