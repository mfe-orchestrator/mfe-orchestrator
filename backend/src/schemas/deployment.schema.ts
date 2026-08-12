import { boolean, objectId, objectIdArray, params, strictBody, stringArray } from "./common"

export const createDeploymentSchema = {
    body: strictBody({ environmentIds: objectIdArray }, ["environmentIds"])
}

export const deploymentIdSchema = {
    params: params({ deploymentId: objectId })
}

/**
 * A canary user id is not an ObjectId and must not be constrained to one: it is the
 * identifier the host application knows its own users by, stored as a plain string,
 * which is the whole point of targeting a canary at specific users.
 *
 * It still has to be a string. `deleteCanaryUsers` puts the array straight into a
 * `$in`, so an object among its elements would be read as an operator.
 */
const canaryUserIds = stringArray(512)

export const setCanaryUsersSchema = {
    params: params({ deploymentId: objectId }),
    body: strictBody({ userIds: canaryUserIds, enabled: boolean }, ["userIds", "enabled"])
}

export const deleteCanaryUsersSchema = {
    params: params({ deploymentId: objectId }),
    body: canaryUserIds
}
