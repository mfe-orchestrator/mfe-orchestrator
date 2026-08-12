import { arrayBody, longText, objectId, params, requiredShortText, strictBody } from "./common"

/**
 * Schemas for the global variables endpoints.
 *
 * A variable is looked up by `key` and by `environmentId` before being written, so
 * both are pinned to a scalar: an object in either position would turn the lookup
 * into an operator and reach a variable of another environment.
 */

const environmentValue = strictBody(
    {
        environmentId: objectId,
        value: longText(65536)
    },
    ["environmentId", "value"]
)

export const listGlobalVariablesByProjectSchema = {
    params: params({ projectId: objectId })
}

export const createGlobalVariableSchema = {
    body: strictBody(
        {
            key: requiredShortText(),
            values: arrayBody(environmentValue)
        },
        ["key", "values"]
    )
}

export const updateGlobalVariableSchema = {
    body: strictBody(
        {
            key: requiredShortText(),
            originalKey: requiredShortText(),
            values: arrayBody(environmentValue)
        },
        ["key", "originalKey", "values"]
    )
}

export const deleteGlobalVariableSchema = {
    body: strictBody({ key: requiredShortText() }, ["key"])
}
