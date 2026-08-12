import { StorageType } from "../models/StorageModel"
import { boolean, enumOf, objectId, params, requiredShortText, shortText, strictBody } from "./common"

/**
 * Schemas for the storage endpoints.
 *
 * `authConfig` is the credential blob of a cloud provider and its shape belongs to
 * the provider's SDK, not to this codebase, so it is accepted as an object without
 * declaring what is inside. The top level stays strict all the same: `update`
 * spreads the body into `findByIdAndUpdate`, and that is where an update operator
 * would otherwise take effect.
 */
const storageFields = {
    name: requiredShortText(),
    type: enumOf(Object.values(StorageType)),
    path: shortText(1024),
    default: boolean,
    authConfig: { type: "object" }
}

export const storageIdSchema = {
    params: params({ storageId: objectId })
}

export const listStoragesSchema = {
    params: params({ projectId: objectId })
}

export const createStorageSchema = {
    body: strictBody(storageFields, ["name", "type"])
}

export const updateStorageSchema = {
    params: params({ storageId: objectId }),
    body: strictBody(storageFields, ["name", "type"])
}
