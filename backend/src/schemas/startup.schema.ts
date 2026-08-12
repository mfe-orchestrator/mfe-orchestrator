import { email, password, requiredShortText, strictBody } from "./common"

/**
 * The first-run endpoint. It is public and creates both a user and a project, so
 * the body is pinned as tightly as the registration one.
 */
export const startupRegistrationSchema = {
    body: strictBody({ email, password, project: requiredShortText() }, ["email", "password", "project"])
}
