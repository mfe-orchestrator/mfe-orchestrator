import { objectId, objectIdArray, params, shortText, strictBody, stringArray } from "./common"

/**
 * Schemas for the dependency scan and alignment endpoints.
 *
 * `branches` is keyed by microfrontend id, so the keys are constrained with
 * `patternProperties` rather than listed: an id that is not an ObjectId is
 * rejected instead of becoming a lookup key.
 */
const branches = {
    type: "object",
    patternProperties: {
        "^[0-9a-fA-F]{24}$": shortText(512)
    },
    additionalProperties: false
}

export const dependencyReportSchema = {
    body: strictBody({ branches })
}

export const projectDependenciesSchema = {
    params: params({ projectId: objectId })
}

export const alignmentSchema = {
    body: strictBody({
        branches,
        microfrontendIds: objectIdArray,
        packages: stringArray(512),
        branchName: shortText(512),
        commitMessage: shortText(1024)
    })
}
