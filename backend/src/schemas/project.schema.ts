import { boolean, longText, objectId, params, requiredShortText, shortText, strictBody } from "./common"

/**
 * Schemas for the project endpoints.
 *
 * `update` spreads the body into the update document handed to
 * `findByIdAndUpdate`, so a key the schema does not declare would reach mongoose
 * as written — including one starting with `$`, which mongo reads as an update
 * operator rather than a field. The strict body is what keeps the update to the
 * four fields a project actually has.
 */

export const projectIdSchema = {
    params: params({ projectId: objectId })
}

export const createProjectSchema = {
    body: strictBody(
        {
            name: requiredShortText(),
            slug: requiredShortText(),
            description: longText(),
            isActive: boolean
        },
        ["name", "slug"]
    )
}

/**
 * `description: null` is meaningful here — the service turns it into an `$unset` —
 * so the field is nullable instead of merely optional.
 */
export const updateProjectSchema = {
    params: params({ projectId: objectId }),
    body: strictBody({
        name: shortText(),
        slug: shortText(),
        description: { anyOf: [longText(), { type: "null" }] },
        isActive: boolean
    })
}
