import { ObjectId, Schema } from "mongoose"
import { CodeRepositoryProvider } from "../models/CodeRepositoryModel"
import { ICodeRepositoryMicrofrontend } from "../models/MicrofrontendModel"

/**
 * What a link to a repository belongs to: a microfrontend or a service of the project. Without `kind` and
 * `_id`, only the links naming the same repository are found, not the owner by its own id.
 */
export interface RepositoryLinkOwner {
    projectId: string | Schema.Types.ObjectId | ObjectId
    kind?: "microfrontend" | "service"
    _id?: unknown
}

/**
 * The queries for what links to the same repository as `link` in the project: the owner itself among the
 * microfrontends or the services, and those of either kind with the same id, path or name. A query is
 * undefined when nothing can match it.
 */
export const linksToRepository = (owner: RepositoryLinkOwner, provider: CodeRepositoryProvider | undefined, link: ICodeRepositoryMicrofrontend) => {
    // Names are unique per owner on GitHub and per project on Azure DevOps, but a GitLab
    // connection can reach two groups with a repository of the same name: there the path tells.
    const sameRepository: Record<string, unknown>[] = []
    if (link.repositoryId) sameRepository.push({ "codeRepository.repositoryId": link.repositoryId })
    if (provider === CodeRepositoryProvider.GITLAB) {
        if (link.gitlab?.path) sameRepository.push({ "codeRepository.gitlab.path": link.gitlab.path })
    } else if (link.name) {
        sameRepository.push({ "codeRepository.name": link.name })
    }
    const linksToIt: Record<string, unknown> = { projectId: owner.projectId, "codeRepository.codeRepositoryId": link.codeRepositoryId }
    const ofKind = (kind: RepositoryLinkOwner["kind"]) => {
        const conditions = owner.kind === kind && owner._id ? [{ _id: owner._id }, ...sameRepository] : sameRepository
        return conditions.length > 0 ? { ...linksToIt, $or: conditions } : undefined
    }
    return { microfrontends: ofKind("microfrontend"), services: ofKind("service") }
}
