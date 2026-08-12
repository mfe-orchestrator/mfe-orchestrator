import { CodeRepositoryType } from "../models/CodeRepositoryModel"
import { enumOf, integer, objectId, params, query, requiredShortText, secretString, shortText, strictBody, stringArray } from "./common"

/**
 * Schemas for the code repository endpoints.
 *
 * Personal access tokens travel through several of these bodies. They are opaque
 * to this platform, so only their shape is constrained — but constraining it is
 * what keeps a token field from arriving as an object and being stored, and later
 * spread, as one. `editRepository*` reaches `findOneAndUpdate`, so those bodies are
 * strict for the same reason the project ones are.
 */

/** Both `:repositoryId` and `:codeRepositoryId` name a document of this collection. */
export const repositoryIdSchema = {
    params: params({ repositoryId: objectId })
}

export const codeRepositoryIdSchema = {
    params: params({ codeRepositoryId: objectId })
}

export const listRepositoriesByProjectSchema = {
    params: params({ projectId: objectId })
}

/**
 * The repository identifier of a provider is not an ObjectId: GitHub uses a
 * number, Azure DevOps a GUID, GitLab a path. It stays a bounded free string.
 */
const providerRepositoryId = { type: "string", minLength: 1, maxLength: 512 }

export const branchesSchema = {
    params: params({ codeRepositoryId: objectId, repositoryId: providerRepositoryId })
}

export const importableRepositoriesSchema = {
    params: params({ codeRepositoryId: objectId }),
    querystring: query({ groupId: integer() })
}

export const importRepositoriesSchema = {
    params: params({ codeRepositoryId: objectId }),
    body: strictBody({
        repositoryIds: stringArray(512),
        groupId: integer(),
        version: shortText(64)
    })
}

export const checkNameSchema = {
    params: params({ repositoryId: objectId }),
    querystring: query({ name: requiredShortText(), groupPath: shortText(512), groupId: integer() }, ["name"])
}

export const revokeGithubGrantSchema = {
    body: strictBody({ repositoryId: objectId })
}

export const githubCallbackSchema = {
    body: strictBody(
        {
            code: secretString(2048),
            state: secretString(512),
            codeRepositoryId: objectId
        },
        ["code", "state"]
    )
}

export const updateGithubSchema = {
    params: params({ repositoryId: objectId }),
    body: strictBody(
        {
            name: requiredShortText(),
            type: enumOf(Object.values(CodeRepositoryType)),
            organizationId: shortText(512),
            userName: shortText()
        },
        ["name"]
    )
}

const gitlabFields = {
    url: requiredShortText(2048),
    pat: secretString(),
    name: requiredShortText(),
    groupId: integer(),
    groupPath: shortText(512)
}

export const createGitlabSchema = {
    body: strictBody(gitlabFields, ["url", "pat", "name"])
}

export const updateGitlabSchema = {
    params: params({ repositoryId: objectId }),
    body: strictBody(gitlabFields, ["url", "pat", "name"])
}

export const testGitlabSchema = {
    body: strictBody({ url: requiredShortText(2048), pat: secretString() }, ["url", "pat"])
}

const azureFields = {
    pat: secretString(),
    name: requiredShortText(),
    organization: requiredShortText(),
    projectId: requiredShortText(512),
    projectName: shortText()
}

export const createAzureSchema = {
    body: strictBody(azureFields, ["pat", "name", "organization", "projectId"])
}

export const updateAzureSchema = {
    params: params({ repositoryId: objectId }),
    body: strictBody(azureFields, ["pat", "name", "organization", "projectId"])
}

export const testAzureSchema = {
    body: strictBody({ organization: requiredShortText(), pat: secretString() }, ["organization", "pat"])
}

export const azureProjectRepositoriesSchema = {
    params: params({ repositoryId: objectId, projectId: requiredShortText(512) })
}

export const azureCheckRepositoryNameSchema = {
    params: params({ repositoryId: objectId, projectId: requiredShortText(512) }),
    body: strictBody({ repositoryName: requiredShortText() }, ["repositoryName"])
}

/** GitLab group ids are numeric, and the handler parses the segment with `parseInt`. */
export const gitlabGroupSchema = {
    params: params({ repositoryId: objectId, groupId: { type: "string", pattern: "^[0-9]+$", maxLength: 20 } })
}
