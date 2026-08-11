import { Schema } from "mongoose"
import { createBusinessException } from "../errors/BusinessException"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import { ICodeRepository } from "../models/CodeRepositoryModel"
import Microfrontend, { HostedOn, ICodeRepositoryMicrofrontend, IHostMicrofrontend, IMicrofrontend } from "../models/MicrofrontendModel"
import Storage from "../models/StorageModel"
import ImportRepositoriesDTO from "../types/ImportRepositoriesDTO"
import { buildUniqueSlug, NormalizedRepository, normalizeRepository } from "../utils/codeRepositoryUtils"
import { toObjectId } from "../utils/mongooseUtils"
import BaseAuthorizedService from "./BaseAuthorizedService"
import CodeRepositoryService from "./CodeRepositoryService"

const defaultEntryPoint = "assets/remoteEntry.js"
const defaultVersion = "1.0.0"

export interface ImportableRepository extends NormalizedRepository {
    /** Slug the microfrontend would get, already deduplicated against the project. */
    slug: string
    alreadyImported: boolean
    /** Set when the repository is already linked to a microfrontend of this project. */
    importedAs?: {
        _id: string
        slug: string
        name: string
    }
}

export interface ImportedRepositoryResult {
    repositoryId: string
    name: string
    slug: string
    microfrontendId: string
}

export interface SkippedRepositoryResult {
    repositoryId: string
    name: string
    reason: "ALREADY_IMPORTED" | "NOT_FOUND"
}

export interface FailedRepositoryResult {
    repositoryId: string
    name: string
    error: string
}

export interface ImportRepositoriesResult {
    imported: ImportedRepositoryResult[]
    skipped: SkippedRepositoryResult[]
    failed: FailedRepositoryResult[]
}

export class CodeRepositoryImportService extends BaseAuthorizedService {
    /**
     * Lists every repository reachable through a code repository connection, flagging the ones already
     * linked to a microfrontend so the caller can offer a "import all the missing ones" action.
     */
    async getImportableRepositories(codeRepositoryId: string, groupId?: number): Promise<ImportableRepository[]> {
        const codeRepositoryService = new CodeRepositoryService(this.user)
        const codeRepository = await codeRepositoryService.findById(codeRepositoryId)
        if (!codeRepository) {
            throw new EntityNotFoundError(codeRepositoryId)
        }

        const repositories = await this.fetchRepositories(codeRepositoryService, codeRepository, groupId)
        const linkedMicrofrontends = await this.getLinkedMicrofrontends(codeRepository)
        const takenSlugs = await this.getTakenSlugs(codeRepository.projectId)

        return repositories.map(repository => {
            const microfrontend = this.findLinkedMicrofrontend(linkedMicrofrontends, repository)

            return {
                ...repository,
                // Already imported repositories keep the slug they were imported with, so it stays recognizable.
                slug: microfrontend?.slug ?? this.reserveSlug(repository.name, takenSlugs),
                alreadyImported: Boolean(microfrontend),
                importedAs: microfrontend
                    ? {
                          _id: microfrontend._id.toString(),
                          slug: microfrontend.slug,
                          name: microfrontend.name
                      }
                    : undefined
            }
        })
    }

    /**
     * Creates one microfrontend per selected repository. Repositories are imported independently: a single
     * failure is reported back instead of rolling back the whole batch.
     */
    async importRepositories(codeRepositoryId: string, body: ImportRepositoriesDTO = {}): Promise<ImportRepositoriesResult> {
        const codeRepositoryService = new CodeRepositoryService(this.user)
        const codeRepository = await codeRepositoryService.findById(codeRepositoryId)
        if (!codeRepository) {
            throw new EntityNotFoundError(codeRepositoryId)
        }

        const repositories = await this.fetchRepositories(codeRepositoryService, codeRepository, body.groupId)
        const linkedMicrofrontends = await this.getLinkedMicrofrontends(codeRepository)
        const takenSlugs = await this.getTakenSlugs(codeRepository.projectId)
        const host = await this.resolveHost(codeRepository.projectId)

        const result: ImportRepositoriesResult = { imported: [], skipped: [], failed: [] }

        const requestedIds = body.repositoryIds?.filter(Boolean)
        if (requestedIds?.length) {
            const availableIds = new Set(repositories.map(repository => repository.repositoryId))
            for (const repositoryId of requestedIds) {
                if (!availableIds.has(repositoryId)) {
                    result.skipped.push({ repositoryId, name: repositoryId, reason: "NOT_FOUND" })
                }
            }
        }

        // No explicit selection means "import everything that is still missing".
        const selected = requestedIds?.length ? repositories.filter(repository => requestedIds.includes(repository.repositoryId)) : repositories

        for (const repository of selected) {
            const alreadyImported = this.findLinkedMicrofrontend(linkedMicrofrontends, repository)
            if (alreadyImported) {
                result.skipped.push({ repositoryId: repository.repositoryId, name: repository.name, reason: "ALREADY_IMPORTED" })
                continue
            }

            const slug = this.reserveSlug(repository.name, takenSlugs)

            try {
                const microfrontend = await Microfrontend.create({
                    name: repository.name,
                    slug,
                    description: repository.description,
                    version: body.version || defaultVersion,
                    projectId: toObjectId(codeRepository.projectId),
                    host,
                    codeRepository: this.buildMicrofrontendCodeRepository(codeRepository, repository, body.groupId)
                } as unknown as IMicrofrontend)

                result.imported.push({
                    repositoryId: repository.repositoryId,
                    name: repository.name,
                    slug,
                    microfrontendId: microfrontend._id.toString()
                })
            } catch (error) {
                // The slug is not used after all, so give it back to the next repository of the batch.
                takenSlugs.delete(slug)
                result.failed.push({
                    repositoryId: repository.repositoryId,
                    name: repository.name,
                    error: error instanceof Error ? error.message : String(error)
                })
            }
        }

        return result
    }

    private async fetchRepositories(codeRepositoryService: CodeRepositoryService, codeRepository: ICodeRepository, groupId?: number): Promise<NormalizedRepository[]> {
        const repositories = await codeRepositoryService.getRepositories(codeRepository._id.toString(), undefined, groupId)

        if (!repositories) {
            throw createBusinessException({
                code: "REPOSITORIES_NOT_AVAILABLE",
                message: "Unable to list the repositories of this code repository connection",
                statusCode: 400
            })
        }

        return repositories
            .map(repository => normalizeRepository(repository as unknown as Record<string, unknown>, codeRepository.provider))
            .filter((repository): repository is NormalizedRepository => Boolean(repository))
            .sort((a, b) => a.name.localeCompare(b.name))
    }

    private async getLinkedMicrofrontends(codeRepository: ICodeRepository): Promise<IMicrofrontend[]> {
        return Microfrontend.find({
            projectId: toObjectId(codeRepository.projectId),
            "codeRepository.codeRepositoryId": toObjectId(codeRepository._id)
        })
    }

    private async getTakenSlugs(projectId: Schema.Types.ObjectId): Promise<Set<string>> {
        const microfrontends = await Microfrontend.find({ projectId: toObjectId(projectId) }, { slug: 1 })
        return new Set(microfrontends.map(microfrontend => microfrontend.slug))
    }

    private reserveSlug(name: string, takenSlugs: Set<string>): string {
        const slug = buildUniqueSlug(name, takenSlugs)
        takenSlugs.add(slug)
        return slug
    }

    /**
     * Microfrontends created through the UI do not always carry the provider id (it is only known once the
     * repository exists), so the name is used as a fallback to recognize an already imported repository.
     */
    private findLinkedMicrofrontend(microfrontends: IMicrofrontend[], repository: NormalizedRepository): IMicrofrontend | undefined {
        return microfrontends.find(microfrontend => {
            const linked = microfrontend.codeRepository
            if (!linked) return false
            if (linked.repositoryId && linked.repositoryId === repository.repositoryId) return true
            return Boolean(linked.name) && linked.name.toLowerCase() === repository.name.toLowerCase()
        })
    }

    private buildMicrofrontendCodeRepository(codeRepository: ICodeRepository, repository: NormalizedRepository, groupId?: number): ICodeRepositoryMicrofrontend {
        return {
            enabled: true,
            codeRepositoryId: codeRepository._id,
            repositoryId: repository.repositoryId,
            name: repository.name,
            repositoryData: {},
            cloneUrlHttps: repository.cloneUrlHttps,
            cloneUrlSsh: repository.cloneUrlSsh,
            gitlab: repository.gitlab
                ? {
                      groupId: repository.gitlab.groupId ?? groupId ?? codeRepository.gitlabData?.groupId,
                      path: repository.gitlab.path ?? codeRepository.gitlabData?.groupPath
                  }
                : undefined
        } as ICodeRepositoryMicrofrontend
    }

    /** Same defaults as the "add microfrontend" form: the project default storage when there is one, the hub otherwise. */
    private async resolveHost(projectId: Schema.Types.ObjectId): Promise<IHostMicrofrontend> {
        const defaultStorage = await Storage.findOne({ projectId: toObjectId(projectId), default: true })

        if (defaultStorage) {
            return {
                type: HostedOn.CUSTOM_SOURCE,
                storageId: defaultStorage._id,
                entryPoint: defaultEntryPoint
            }
        }

        return {
            type: HostedOn.MFE_ORCHESTRATOR_HUB,
            entryPoint: defaultEntryPoint
        }
    }
}

export default CodeRepositoryImportService
