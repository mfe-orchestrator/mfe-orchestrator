import { CodeRepositoryType } from "../models/CodeRepositoryModel"

export default interface UpdateGithubDTO {
    name: string
    type: CodeRepositoryType
    organizationId?: string
    userName: string
}