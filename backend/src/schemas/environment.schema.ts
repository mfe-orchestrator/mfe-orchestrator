import { arrayBody, integer, longText, objectId, objectIdArray, params, requiredShortText, shortText, strictBody } from "./common"

/**
 * Schemas for the environment endpoints.
 *
 * `update` hands the body to `findOneAndUpdate`, so the same reasoning as the
 * project schemas applies: the strict body is what keeps an update operator out of
 * the update document. Clients round-trip the whole entity on save, so `_id`,
 * `createdAt` and `updatedAt` arrive too and are dropped here rather than being
 * written back.
 */

const environmentFields = {
    name: requiredShortText(),
    slug: requiredShortText(),
    description: longText(),
    order: integer(),
    color: shortText(32),
    isProduction: { type: "boolean" },
    domains: arrayBody(shortText(2048))
}

export const environmentIdSchema = {
    params: params({ id: objectId })
}

export const createEnvironmentSchema = {
    body: strictBody(environmentFields, ["name", "slug"])
}

export const createEnvironmentsBulkSchema = {
    body: arrayBody(strictBody(environmentFields, ["name", "slug"]))
}

export const updateEnvironmentSchema = {
    params: params({ id: objectId }),
    body: strictBody(environmentFields)
}

export const reorderEnvironmentsSchema = {
    body: strictBody({ ids: objectIdArray }, ["ids"])
}

export const deleteEnvironmentsSchema = {
    body: objectIdArray
}
