import mongoose, { ObjectId, Document, Schema } from "mongoose"
import { AzureStorageConfig } from "../client/AzureStorageAccount"
import { GoogleStorageConfig } from "../client/GoogleStorageAccount"
import { S3ClientConfig } from "../client/S3Buckets"

export enum StorageType {
    AZURE = "AZURE",
    AWS = "AWS",
    GOOGLE = "GOOGLE"
}

export type IStorageAuth =
    | {
          type: StorageType.GOOGLE
          authConfig: GoogleStorageConfig
      }
    | {
          type: StorageType.AZURE
          authConfig: AzureStorageConfig
      }
    | {
          type: StorageType.AWS
          authConfig: S3ClientConfig
      }

export type IStorage = Document<ObjectId> &
    IStorageAuth & {
        name: string
        projectId: ObjectId
    }

// Define schemas for each storage type's auth config
const googleStorageConfigSchema = new Schema<GoogleStorageConfig>({
    authType: { 
        type: String, 
        enum: ['serviceAccount', 'apiKey', 'default'],
        required: true 
    },
    projectId: { type: String, required: true },
    // Only one of these fields will be present based on authType
    credentials: {
        client_email: { type: String, required: false },
        private_key: { type: String, required: false }
    },
    apiKey: { type: String, required: false },
    bucketName: { type: String, required: true }
}, { 
    _id: false,
    discriminatorKey: 'authType'
});

const azureStorageConfigSchema = new Schema<AzureStorageConfig>({
    accountName: { type: String, required: true },
    accountKey: { type: String, required: true },
    containerName: { type: String, required: true }
}, { _id: false });

const s3StorageConfigSchema = new Schema<S3ClientConfig>({
    region: { type: String, required: true },
    accessKeyId: { type: String, required: true },
    secretAccessKey: { type: String, required: true },
    bucketName: { type: String, required: true }
}, { _id: false });

// Main storage schema
const storageSchema = new Schema<IStorage>(
    {
        name: {
            type: String,
            required: true
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
        authConfig: {
            type: Schema.Types.Mixed,
            required: true,
            validate: {
                validator: function (value: any) {
                    const storageType = (this as any).type as StorageType

                    switch (storageType) {
                        case StorageType.GOOGLE:
                            if (!value.projectId || !value.authType) return false
                            if (value.authType === "serviceAccount") {
                                return value.credentials?.client_email && value.credentials?.private_key
                            } else if (value.authType === "apiKey") {
                                return value.apiKey
                            }
                            return true // default auth
                        case StorageType.AZURE:
                            return value.accountName && value.accountKey && value.containerName
                        case StorageType.AWS:
                            return value.region && value.accessKeyId && value.secretAccessKey && value.bucketName
                        default:
                            return false
                    }
                },
                message: function (props: any) {
                    const storageType = (this as any).type as StorageType
                    return `Invalid authConfig for ${storageType} storage: ${JSON.stringify(props.value)}`
                }
            }
        }
    },
    {
        timestamps: true,
        discriminatorKey: "type"
    }
)

const Storage = mongoose.model<IStorage>("Storage", storageSchema)
export default Storage
