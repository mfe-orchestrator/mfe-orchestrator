import { email, enumOf, password, secretString, shortText, strictBody } from "./common"

/**
 * Schemas for the account endpoints.
 *
 * Five of these routes are public and three of them look a value up in the user
 * collection by a token or an email taken straight from the body. Those are the
 * ones that turn an unvalidated object into a query operator, so every field that
 * reaches a filter is pinned to a string here.
 */

const THEMES = ["LIGHT", "DARK", "SYSTEM"] as const
const LANGUAGES = ["it", "en"] as const
/** Mirrors the enum on the user schema; the invitation is the only route that sets it. */
const ROLES = ["user", "admin"] as const

export const registrationSchema = {
    body: strictBody(
        {
            email,
            password,
            name: shortText(),
            surname: shortText(),
            marketingConsent: { type: "boolean" }
        },
        ["email"]
    )
}

export const accountActivationSchema = {
    body: strictBody({ token: secretString(512) }, ["token"])
}

/**
 * The password is deliberately not bound to the registration policy: an account
 * created before the policy, or through an invitation, must still be able to sign
 * in, and a length check here would answer questions about stored passwords that
 * the login endpoint should not answer.
 */
export const loginSchema = {
    body: strictBody({ email, password: { type: "string", maxLength: 256 } }, ["email", "password"])
}

export const forgotPasswordSchema = {
    body: strictBody({ email }, ["email"])
}

export const resetPasswordSchema = {
    body: strictBody({ token: secretString(512), password }, ["token", "password"])
}

export const invitationSchema = {
    body: strictBody(
        {
            email,
            name: shortText(),
            surname: shortText(),
            role: enumOf(ROLES)
        },
        ["email"]
    )
}

/**
 * Theme and language are written with `updateOne`, which does not run the mongoose
 * validators, so until now any string reached the document. The enum is the only
 * thing standing between the request and the stored value.
 */
export const themeSchema = {
    body: strictBody({ theme: enumOf(THEMES) }, ["theme"])
}

export const languageSchema = {
    body: strictBody({ language: enumOf(LANGUAGES) }, ["language"])
}
