import axios from "axios"
import AzureDevOpsClient from "../client/AzureDevOpsClient"
import GithubClient from "../client/GithubClient"
import GitlabClient from "../client/GitlabClient"
import { BusinessException, createBusinessException } from "../errors/BusinessException"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import { CodeRepositoryProvider, ICodeRepository } from "../models/CodeRepositoryModel"
import Microfrontend, { ICodeRepositoryMicrofrontend, IMicrofrontend } from "../models/MicrofrontendModel"
import Project from "../models/ProjectModel"
import Service from "../models/ServiceModel"
import UserProject, { RoleInProject } from "../models/UserProjectModel"
import { NormalizedRepository, normalizeRepository } from "../utils/codeRepositoryUtils"
import { toObjectId } from "../utils/mongooseUtils"
import BaseAuthorizedService from "./BaseAuthorizedService"
import CodeRepositoryService from "./CodeRepositoryService"
import { repositoryNameFor, toErrorMessage } from "./RepositoryFileService"
import { linksToRepository } from "./repositoryLinks"

/**
 * What GitHub, GitLab and Azure DevOps all accept as a repository name, and as a GitLab path too:
 * the name becomes the path, so it must be usable in the clone URL as it is. GitLab refuses a
 * leading '-', Azure DevOps a leading '_' and a trailing '.', and GitLab the two suffixes below.
 */
const REPOSITORY_NAME_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,98}[A-Za-z0-9_-])?$/
const RESERVED_SUFFIX = /\.(git|atom)$/i

export const isValidRepositoryName = (name: string): boolean => REPOSITORY_NAME_PATTERN.test(name) && !RESERVED_SUFFIX.test(name)

/** GitLab explains a refusal field by field: `{ path: ["has already been taken"] }`. */
const readableReason = (reason: unknown): string =>
    typeof reason === "string"
        ? reason
        : Object.entries(reason as Record<string, unknown>)
              .map(([field, problems]) => `${field} ${([] as unknown[]).concat(problems).join(", ")}`)
              .join("; ")

/** The status and the reason a provider gave, from wherever each one puts it. */
const describeProviderError = (error: unknown): { status?: number; message: string } => {
    if (!axios.isAxiosError(error)) return { message: toErrorMessage(error) }
    const data = error.response?.data as { message?: unknown; errors?: { message?: string }[] } | undefined
    const reason = [data?.message, ...(data?.errors ?? []).map(item => item.message)].filter(Boolean).map(readableReason).join(" ")
    return { status: error.response?.status, message: reason || error.message }
}

/** Azure DevOps answers 409, GitHub 422 and GitLab 400, each saying so in its own words. */
const isNameTaken = ({ status, message }: { status?: number; message: string }) => status === 409 || /already (exists|been taken)/i.test(message)

/** Whether a provider refused to create or rename a repository because the name is in use. */
export const isRepositoryNameTakenError = (error: unknown): boolean => axios.isAxiosError(error) && isNameTaken(describeProviderError(error))

/**
 * Renames the repository of a microfrontend at its provider, then updates what the console keeps
 * about it. The microfrontend itself keeps its name and slug: those are what deployments and
 * uploaded bundles are addressed by.
 */
export class RepositoryRenameService extends BaseAuthorizedService {
    async renameMicrofrontendRepository(microfrontendId: string, name: unknown): Promise<IMicrofrontend | null> {
        const newName = typeof name === "string" ? name.trim() : ""
        if (!isValidRepositoryName(newName)) {
            throw createBusinessException({
                code: "INVALID_REPOSITORY_NAME",
                message: "A repository name takes letters, digits, '.', '_' and '-' (up to 100), starts with a letter or a digit, cannot end with '.' and cannot end with '.git' or '.atom'"
            })
        }

        const microfrontend = await Microfrontend.findById(toObjectId(microfrontendId))
        if (!microfrontend) {
            throw new EntityNotFoundError(microfrontendId)
        }
        await this.ensureCanChangeRepository(microfrontend.projectId)
        await this.ensureInDomainScope(microfrontend.projectId, microfrontend.domainId)

        const link = microfrontend.codeRepository
        if (!link?.enabled || !link.codeRepositoryId) {
            throw createBusinessException({ code: "REPOSITORY_NOT_LINKED", message: "The microfrontend has no code repository linked", statusCode: 422 })
        }

        const codeRepository = await new CodeRepositoryService(this.user).findById(link.codeRepositoryId.toString())
        if (!codeRepository || codeRepository.projectId.toString() !== microfrontend.projectId.toString()) {
            throw new EntityNotFoundError(link.codeRepositoryId.toString())
        }

        if (link.name === newName) {
            return microfrontend
        }
        await this.ensureEveryLinkInScope(microfrontend, codeRepository, link)

        let renamed: NormalizedRepository | undefined
        try {
            renamed = normalizeRepository(await this.renameAtProvider(codeRepository, link, newName), codeRepository.provider)
        } catch (error) {
            if (error instanceof BusinessException) throw error
            const reason = describeProviderError(error)
            throw isNameTaken(reason)
                ? createBusinessException({ code: "REPOSITORY_NAME_TAKEN", message: `A repository named "${newName}" already exists`, statusCode: 409 })
                : createBusinessException({ code: "REPOSITORY_RENAME_FAILED", message: reason.message, statusCode: 422 })
        }
        if (!renamed) {
            throw createBusinessException({ code: "REPOSITORY_RENAME_FAILED", message: "The provider did not return the renamed repository", statusCode: 422 })
        }

        try {
            await this.recordRename(microfrontend, codeRepository, link, renamed)
        } catch (error) {
            throw createBusinessException({
                code: "REPOSITORY_RENAMED_NOT_RECORDED",
                message: `The repository is now named "${renamed.name}" at the provider, but the console could not record it: select it again on the microfrontend. ${toErrorMessage(error)}`,
                statusCode: 500
            })
        }

        return Microfrontend.findById(microfrontend._id)
    }

    /**
     * Same rule as for the AI changes: renaming a repository moves the URL every clone and pipeline
     * of the team uses, so a VIEWER may not. Organization administrators reach every project.
     */
    private async ensureCanChangeRepository(projectId: IMicrofrontend["projectId"]) {
        await this.ensureAccessToProject(projectId)
        const user = this.getUser()
        if (!user) throw createBusinessException({ code: "REPOSITORY_RENAME_FORBIDDEN", message: "Not allowed", statusCode: 403 })
        const membership = await UserProject.findOne({ userId: user._id, projectId, invitationToken: null })
        if (membership?.role !== RoleInProject.VIEWER) return
        const project = await Project.findById(projectId, { organizationId: 1 })
        if (project && (await this.isOrganizationAdmin(project.organizationId))) return
        throw createBusinessException({ code: "REPOSITORY_RENAME_FORBIDDEN", message: "A viewer cannot rename the repository of a microfrontend", statusCode: 403 })
    }

    /**
     * The new name is written into every link to the repository: a domain-scoped member renames it only
     * when every microfrontend and service linked to it is of their domains, none of another or of none.
     */
    private async ensureEveryLinkInScope(microfrontend: IMicrofrontend, codeRepository: ICodeRepository, link: ICodeRepositoryMicrofrontend) {
        await this.ensureRepositoryInDomainScope({ kind: "microfrontend", _id: microfrontend._id, projectId: microfrontend.projectId }, link, codeRepository.provider)
    }

    /**
     * The link's id and name can disagree when a repository was picked again without its id: the
     * console then shows one repository and the id points to another. Renaming would hit the one
     * the user did not see, so the two must agree first.
     */
    private ensureSameRepository(foundName: string, link: ICodeRepositoryMicrofrontend) {
        if (link.name && foundName.toLowerCase() !== link.name.toLowerCase()) {
            throw createBusinessException({
                code: "REPOSITORY_LINK_INCONSISTENT",
                message: `The microfrontend shows "${link.name}" but its link points to "${foundName}": select the repository again and save before renaming it`,
                statusCode: 409
            })
        }
    }

    private async renameAtProvider(codeRepository: ICodeRepository, link: ICodeRepositoryMicrofrontend, newName: string): Promise<Record<string, unknown>> {
        switch (codeRepository.provider) {
            case CodeRepositoryProvider.GITHUB:
                // GitHub addresses a repository by its name: there is nothing else to disagree with.
                return (await new GithubClient().renameRepository({
                    accessToken: codeRepository.accessToken,
                    orgName: codeRepository.githubData?.organizationId,
                    userName: codeRepository.githubData?.userName,
                    repositoryName: repositoryNameFor(link, codeRepository),
                    newName
                })) as unknown as Record<string, unknown>
            case CodeRepositoryProvider.GITLAB: {
                if (!codeRepository.gitlabData?.url) break
                const client = new GitlabClient(codeRepository.gitlabData.url, codeRepository.accessToken)
                // GitLab takes the numeric id or the full path, never a bare name.
                const groupPath = codeRepository.gitlabData.groupPath
                const address = link.repositoryId || link.gitlab?.path || (groupPath ? `${groupPath}/${link.name}` : link.name)
                const project = await client.getProject(encodeURIComponent(address))
                this.ensureSameRepository(project.name, link)
                return (await client.renameProject(project.id, newName)) as unknown as Record<string, unknown>
            }
            case CodeRepositoryProvider.AZURE_DEV_OPS: {
                if (!codeRepository.azureData) break
                const { organization, projectId } = codeRepository.azureData
                const client = new AzureDevOpsClient()
                // Azure DevOps updates a repository by its id only, and older links kept the name.
                const repository = await client.getRepository(codeRepository.accessToken, organization, projectId, repositoryNameFor(link, codeRepository))
                this.ensureSameRepository(repository.name, link)
                return (await client.renameRepository(codeRepository.accessToken, organization, projectId, repository.id, newName)) as unknown as Record<string, unknown>
            }
        }
        throw new Error(`The ${codeRepository.provider} connection is missing the data needed to reach the provider`)
    }

    /**
     * Writes the new name into every link of the project to that repository, microfrontends and
     * services alike: a stale one would keep cloning from the old URL, which Azure DevOps does not
     * redirect. Field by field, so an edit saved meanwhile on the rest of a document is kept.
     */
    private async recordRename(microfrontend: IMicrofrontend, codeRepository: ICodeRepository, link: ICodeRepositoryMicrofrontend, renamed: NormalizedRepository) {
        const set: Record<string, unknown> = {
            "codeRepository.name": renamed.name,
            // The provider id, even where a name was kept until now: every API accepts it, and
            // unlike the name it survives the next rename.
            "codeRepository.repositoryId": renamed.repositoryId,
            // The provider's answer as it was at link time: its URLs point to the old name, and
            // the workspace would clone from them.
            "codeRepository.repositoryData": {}
        }
        if (renamed.cloneUrlHttps) set["codeRepository.cloneUrlHttps"] = renamed.cloneUrlHttps
        if (renamed.cloneUrlSsh) set["codeRepository.cloneUrlSsh"] = renamed.cloneUrlSsh
        if (renamed.gitlab?.path) set["codeRepository.gitlab.path"] = renamed.gitlab.path

        const links = linksToRepository({ kind: "microfrontend", _id: microfrontend._id, projectId: microfrontend.projectId }, codeRepository.provider, link)
        await Promise.all([
            links.microfrontends ? Microfrontend.updateMany(links.microfrontends, { $set: set }) : undefined,
            links.services ? Service.updateMany(links.services, { $set: set }) : undefined
        ])
    }
}

export default RepositoryRenameService
