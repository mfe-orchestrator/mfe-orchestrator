import { ApiKeyRole } from "../models/ApiKeyModel"
import { dateLike, enumOf, objectId, params, requiredShortText, strictBody } from "./common"

export const listApiKeysSchema = {
    params: params({ projectId: objectId })
}

/**
 * `expiresAt` is a `Date` in the DTO but travels as an ISO string, which mongoose
 * casts on save. A number is accepted too, for a client sending an epoch.
 */
export const createApiKeySchema = {
    body: strictBody(
        {
            name: requiredShortText(),
            role: enumOf(Object.values(ApiKeyRole)),
            expiresAt: { anyOf: [dateLike, { type: "number" }] }
        },
        ["name", "expiresAt"]
    )
}

export const apiKeyIdSchema = {
    params: params({ apiKeyId: objectId })
}
