import { objectId, objectIdArray, params, requiredShortText, secretString, shortText, strictBody } from "./common"

/** Module federation: nothing is written without saying which microfrontends to write to. */
export const applyFederationSchema = {
    body: strictBody({ microfrontendIds: objectIdArray }, ["microfrontendIds"])
}

/** Marketplace templates are addressed by slug, not by id. */
export const marketSlugSchema = {
    params: params({ slug: { type: "string", minLength: 1, maxLength: 255 } })
}

export const createWizardProjectSchema = {
    body: strictBody(
        {
            name: requiredShortText(),
            slug: requiredShortText(),
            description: shortText(4096),
            isActive: { type: "boolean" }
        },
        ["name", "slug"]
    )
}

export const wizardProjectIdSchema = {
    params: params({ projectId: objectId })
}

/** OAuth exchange endpoints: both are public and forward the value to the provider. */
export const googleAuthCodeSchema = {
    querystring: { type: "object", required: ["code"], properties: { code: secretString(4096) } }
}

export const googleRefreshTokenSchema = {
    body: strictBody({ refresh_token: secretString(4096) }, ["refresh_token"])
}
