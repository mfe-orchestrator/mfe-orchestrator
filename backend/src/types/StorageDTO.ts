import { StorageType } from "../models/StorageModel"

export interface StorageDTO {
    type?: StorageType
    apiKey?: string
    clientId?: string
    clientSecret?: string
    tenantId?: string
    url?: string
}
