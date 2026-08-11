import { ApiKeyRole } from "../models/ApiKeyModel"

export interface ApiKeyDTO {
    name: string
    role?: ApiKeyRole
    expiresAt: Date
}
