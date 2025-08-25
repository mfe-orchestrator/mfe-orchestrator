import { ApiKeyRole, ApiKeyStatus } from "../models/ApiKeyModel"

export interface ApiKeyDTO {
    name?: string
    role?: ApiKeyRole
    expirationDate?: Date
    status?: ApiKeyStatus
}
