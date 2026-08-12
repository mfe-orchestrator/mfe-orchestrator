import { CanaryDeploymentType, CanaryType, HostedOn, MicrofrontendType } from "../models/MicrofrontendModel"
import { MicrofrontendCompiler, MicrofrontendFramework, MicrofrontendStackSource } from "../types/MicrofrontendStack"
import { boolean, enumOf, longText, number, objectId, objectIdArray, openBody, params, requiredShortText, shortText, strictBody } from "./common"

/**
 * Schemas for the microfrontend endpoints.
 *
 * `update` hands the body straight to `findByIdAndUpdate`, so the top level has to
 * be strict: that is what stops `$set` or `$rename` from arriving as an update
 * operator. The nested descriptors are a different matter — `codeRepository`
 * carries provider-shaped data that the clients grow independently of this
 * schema — so inside them the declared fields are type-checked and the rest is
 * passed through instead of being dropped.
 */

const stack = openBody({
    framework: enumOf(Object.values(MicrofrontendFramework)),
    compiler: enumOf(Object.values(MicrofrontendCompiler)),
    source: enumOf(Object.values(MicrofrontendStackSource))
})

const host = openBody({
    type: enumOf(Object.values(HostedOn)),
    url: shortText(2048),
    storageId: objectId,
    entryPoint: shortText(512)
})

const canary = openBody({
    enabled: boolean,
    percentage: number(0, 100),
    type: enumOf(Object.values(CanaryType)),
    deploymentType: enumOf(Object.values(CanaryDeploymentType)),
    url: shortText(2048),
    version: shortText(64)
})

const codeRepository = openBody({
    enabled: boolean,
    codeRepositoryId: objectId,
    repositoryId: shortText(512),
    name: shortText(),
    cloneUrlHttps: shortText(2048),
    cloneUrlSsh: shortText(2048)
})

const position = openBody({
    x: number(),
    y: number(),
    width: number(),
    height: number()
})

const microfrontendFields = {
    type: enumOf(Object.values(MicrofrontendType)),
    slug: requiredShortText(),
    name: requiredShortText(),
    version: shortText(64),
    template: shortText(),
    description: longText(),
    continuousDeployment: boolean,
    path: shortText(1024),
    parentIds: objectIdArray,
    stack,
    host,
    canary,
    codeRepository,
    position
}

export const microfrontendIdSchema = {
    params: params({ id: objectId })
}

export const createMicrofrontendSchema = {
    body: strictBody(microfrontendFields, ["slug", "name"])
}

export const updateMicrofrontendSchema = {
    params: params({ id: objectId }),
    body: strictBody(microfrontendFields)
}

export const bulkDeleteMicrofrontendsSchema = {
    body: objectIdArray
}

export const setStackSchema = {
    params: params({ id: objectId }),
    body: strictBody({
        framework: enumOf(Object.values(MicrofrontendFramework)),
        compiler: enumOf(Object.values(MicrofrontendCompiler))
    })
}

/**
 * `version` becomes a path segment of the directory the archive is extracted into,
 * so the characters it may contain are bounded here. This is a narrowing, not the
 * fix: the destination path still has to be checked for containment where it is
 * built.
 */
export const uploadMicrofrontendSchema = {
    params: params({
        microfrontendSlug: { type: "string", minLength: 1, maxLength: 255, pattern: "^[A-Za-z0-9._-]+$" },
        version: { type: "string", minLength: 1, maxLength: 64, pattern: "^[A-Za-z0-9._+-]+$" }
    })
}

export const buildMicrofrontendSchema = {
    params: params({ id: objectId }),
    body: strictBody({ version: requiredShortText(64), branch: shortText(512) }, ["version"])
}

export const setPositionSchema = {
    params: params({ id: objectId }),
    body: strictBody({ x: number(), y: number() }, ["x", "y"])
}

export const setDimensionSchema = {
    params: params({ id: objectId }),
    body: strictBody({ width: number(), height: number() }, ["width", "height"])
}

export const relationSchema = {
    body: strictBody({ host: objectId, remote: objectId }, ["host", "remote"])
}
