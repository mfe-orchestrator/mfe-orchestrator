import mongoose, { Document, ObjectId, Schema } from "mongoose"
import { AzureStorageConfig } from "../client/AzureStorageAccount"
import { GoogleStorageConfig } from "../client/GoogleStorageAccount"
import { S3ClientConfig } from "../client/S3Buckets"
import { encryptedFields } from "../utils/encryptedFieldsPlugin"
import { SECRET_PLACEHOLDER } from "../utils/secretCrypto"

export enum StorageType {
    AZURE = "AZURE",
    AWS = "AWS",
    GOOGLE = "GOOGLE"
}

/**
 * The keys of an authConfig that are a credential rather than an address.
 *
 * What is left out is left out on purpose: bucket, container, region, account name, tenant and client
 * id say which resource is being talked to, not how to prove you may. Keeping them readable is what
 * lets the list screen name a storage and the edit form come back filled in, and none of them is
 * usable on its own.
 */
export const STORAGE_SECRET_KEYS = ["secretAccessKey", "accountKey", "connectionString", "clientSecret", "jsonKey"] as const

export const STORAGE_SECRET_PATHS = STORAGE_SECRET_KEYS.map(key => `authConfig.${key}`)

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
        path?: string
        toFrontendObject: () => Record<string, unknown>
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
                validator: function (value: Record<string, unknown>): boolean {
                    // In update context, 'this' might be the query, get type from the update data
                    const storageType = this.get("type") as StorageType
                    //const storageType = (this as any)?.type || (this as any)?._update?.$set.type as StorageType

                    if (!storageType) {
                        return false
                    }

                    switch (storageType) {
                        case StorageType.GOOGLE:
                            if (!value.authType) return false
                            if (value.authType === "serviceAccount") {
                                if (!value.jsonKey) return false
                                return true
                            }
                            return false // default auth
                        case StorageType.AZURE:
                            if (value.authType === "connectionString") {
                                return !!(value.connectionString && value.containerName)
                            } else if (value.authType === "sharedKey") {
                                return !!(value.accountKey && value.accountName && value.containerName)
                            } else if (value.authType === "aad") {
                                return !!(value.clientId && value.clientSecret && value.tenantId && value.containerName && value.accountName)
                            }
                            return false
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

storageSchema.plugin(encryptedFields, { model: "Storage", paths: STORAGE_SECRET_PATHS })

/**
 * The storage as the console may see it: everything but the credentials, which are replaced by the
 * placeholder rather than dropped, so the edit form still comes back with its required fields filled
 * and submitting it untouched means "keep the key you already have".
 */
storageSchema.methods.toFrontendObject = function (): Record<string, unknown> {
    const object = this.toObject()
    delete object.__v

    for (const key of STORAGE_SECRET_KEYS) {
        if (object.authConfig?.[key]) {
            object.authConfig[key] = SECRET_PLACEHOLDER
        }
    }

    return object
}

const Storage = mongoose.model<IStorage>("Storage", storageSchema)
export default Storage
