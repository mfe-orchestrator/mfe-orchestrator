import mongoose, { Document, ObjectId, Schema } from "mongoose"
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
          path?: string
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
        default?: boolean
    }
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
        default: {
            type: Boolean,
            default: false,
            required: false
        },
        path: {
            type: String,
            required: false
        },
        authConfig: {
            type: Schema.Types.Mixed,
            required: true,
            validate: {
                validator: function (this: Document, value: Record<string, unknown>): boolean {
                    // In update context, 'this' might be the query, get type from the update data
                    const storageType = this.get("type")
                    //const storageType = (this as any)?.type || (this as any)?._update?.$set.type as StorageType

                    if (!storageType) {
                        return false
                    }

                    switch (storageType) {
                        case StorageType.GOOGLE:
                            if (!value.projectId || !value.authType) return false
                            if (value.authType === "serviceAccount") {
                                const credentials = value.credentials as Record<string, unknown> | undefined
                                return !!(credentials?.client_email && credentials?.private_key)
                            } else if (value.authType === "apiKey") {
                                return !!value.apiKey
                            }
                            return true // default auth
                        case StorageType.AZURE:
                            return !!(value.accountName && value.accountKey && value.containerName)
                        case StorageType.AWS:
                            return !!(value.region && value.accessKeyId && value.secretAccessKey && value.bucketName)
                        default:
                            return false
                    }
                },
                message: function (props: { value?: unknown }) {
                    const storageType = (this as unknown as { type?: StorageType })?.type
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
