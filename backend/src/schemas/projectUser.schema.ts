import { RoleInProject } from "../models/UserProjectModel"
import { email, enumOf, objectId, params, password, secretString, shortText, strictBody } from "./common"

/**
 * Schemas for project membership and invitations.
 *
 * Two of these routes are public and resolve an invitation from a token in the URL.
 * A path parameter always arrives as a string, so the token cannot smuggle an
 * operator, but pinning its shape still turns a malformed token into a 400 instead
 * of an unindexed collection scan.
 */

const ROLES = Object.values(RoleInProject)

export const listProjectUsersSchema = {
    params: params({ projectId: objectId })
}

export const addUserToProjectSchema = {
    params: params({ projectId: objectId }),
    body: strictBody({ email, role: enumOf(ROLES) }, ["email", "role"])
}

export const resendInvitationSchema = {
    params: params({ projectId: objectId, userId: objectId })
}

export const invitationByTokenSchema = {
    params: params({ token: secretString(512) })
}

export const acceptInvitationSchema = {
    params: params({ token: secretString(512) }),
    body: strictBody({ password, name: shortText(), surname: shortText() })
}

export const updateUserRoleSchema = {
    params: params({ projectId: objectId, userId: objectId }),
    body: strictBody({ role: enumOf(ROLES) }, ["role"])
}

export const removeUserFromProjectSchema = {
    params: params({ projectId: objectId, userId: objectId })
}

export const invitationDecisionSchema = {
    params: params({ projectId: objectId })
}
