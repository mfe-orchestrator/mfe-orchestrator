import { objectId, params, query, shortText } from "./common"

/**
 * Schemas for the public serve endpoints.
 *
 * These routes take no body and every parameter is a path segment, so nothing here
 * can smuggle a query operator. What the schemas do buy is that an id that is not
 * an ObjectId is answered with a 400 instead of reaching `findById` and surfacing
 * as a cast error with a 500, and that a slug cannot be an arbitrarily long string
 * on an endpoint that needs no credentials to call.
 *
 * The `*` segment carrying the file path is deliberately left unconstrained: it is
 * a relative path with slashes and dots, and the traversal it enables is not a
 * validation problem but a containment one, fixed where the path is resolved.
 */

const slug = { type: "string", minLength: 1, maxLength: 255 }
const filePath = { type: "string", maxLength: 2048 }
const version = { type: "string", minLength: 1, maxLength: 64 }

export const codeIntegrationSchema = {
    querystring: query({
        framework: shortText(64),
        compiler: shortText(64),
        microfrontendId: objectId,
        deploymentId: objectId
    })
}

export const serveEnvironmentIdSchema = {
    params: params({ environmentId: objectId })
}

export const serveProjectIdSchema = {
    params: params({ projectId: objectId })
}

export const projectAndEnvironmentSlugSchema = {
    params: params({ projectId: objectId, environmentSlug: slug })
}

export const serveMicrofrontendIdSchema = {
    params: params({ mfeId: objectId })
}

export const projectAndMfeSlugSchema = {
    params: params({ projectId: objectId, mfeSlug: slug })
}

export const projectEnvironmentAndMfeSlugSchema = {
    params: params({ projectId: objectId, environmentSlug: slug, mfeSlug: slug })
}

export const environmentAndMfeSlugSchema = {
    params: params({ environmentId: objectId, mfeSlug: slug })
}

export const filesByEnvironmentSlugSchema = {
    params: params({ projectId: objectId, environmentSlug: slug, mfeSlug: slug, "*": filePath })
}

export const filesByEnvironmentSlugAndVersionSchema = {
    params: params({ projectId: objectId, environmentSlug: slug, mfeSlug: slug, version, "*": filePath })
}

export const filesByMicrofrontendIdSchema = {
    params: params({ mfeId: objectId, "*": filePath })
}

export const filesByMicrofrontendIdAndVersionSchema = {
    params: params({ mfeId: objectId, version, "*": filePath })
}

export const filesByRefererSchema = {
    params: params({ projectId: objectId, mfeSlug: slug, "*": filePath })
}

export const filesByRefererAndVersionSchema = {
    params: params({ projectId: objectId, mfeSlug: slug, version, "*": filePath })
}
