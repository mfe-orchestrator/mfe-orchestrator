import { Schema } from "mongoose"
import { createBusinessException } from "../errors/BusinessException"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import { ICodeRepository } from "../models/CodeRepositoryModel"
import Microfrontend, { HostedOn, ICodeRepositoryMicrofrontend, IHostMicrofrontend, IMicrofrontend } from "../models/MicrofrontendModel"
import Service, { IService } from "../models/ServiceModel"
import Storage from "../models/StorageModel"
import ImportRepositoriesDTO, { ImportTarget } from "../types/ImportRepositoriesDTO"
import { SERVICE_SLUG } from "../types/ServiceStack"
import { buildUniqueSlug, NormalizedRepository, normalizeRepository } from "../utils/codeRepositoryUtils"
import { toObjectId } from "../utils/mongooseUtils"
import BaseAuthorizedService, { isInDomainScope } from "./BaseAuthorizedService"
import CodeRepositoryService from "./CodeRepositoryService"
import { resolveDomainId } from "./DomainService"

const defaultEntryPoint = "assets/remoteEntry.js"
const defaultVersion = "1.0.0"

/** What a repository can already be linked to: a microfrontend or a service */
type LinkedMember = Pick<IMicrofrontend | IService, "_id" | "slug" | "name" | "codeRepository" | "domainId">

/** Anything but the two targets is refused: a typo must not quietly import microfrontends */
const ensureTarget = (target: unknown) => {
    if (target !== undefined && target !== "microfrontend" && target !== "service") {
        throw createBusinessException({ code: "IMPORT_TARGET_INVALID", message: `target must be "microfrontend" or "service", not ${JSON.stringify(target)}`, statusCode: 400 })
    }
}

export interface ImportableRepository extends NormalizedRepository {
    /** Slug the microfrontend or the service would get, already deduplicated against the project. */
    slug: string
    alreadyImported: boolean
    /** Set when the repository is already linked to a microfrontend or a service of this project. */
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
    /** Set when imported as a microfrontend */
    microfrontendId?: string
    /** Set when imported as a service */
    serviceId?: string
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
     * linked to a microfrontend or a service so the caller can offer a "import all the missing ones" action.
     */
    async getImportableRepositories(codeRepositoryId: string, groupId?: number, target?: ImportTarget): Promise<ImportableRepository[]> {
        ensureTarget(target)
        const codeRepositoryService = new CodeRepositoryService(this.user)
        const codeRepository = await codeRepositoryService.findById(codeRepositoryId)
        if (!codeRepository) {
            throw new EntityNotFoundError(codeRepositoryId)
        }

        const repositories = await this.fetchRepositories(codeRepositoryService, codeRepository, groupId)
        const linkedMembers = await this.getLinkedMembers(codeRepository)
        const takenSlugs = await this.getTakenSlugs(codeRepository.projectId, target)
        const scope = await this.getDomainScope(codeRepository.projectId)

        return repositories.map(repository => {
            const linked = this.findLinkedMember(linkedMembers, repository)
            // A domain-scoped member learns that a repository is taken, not by what: the microfrontend or the
            // service of another domain stays out of their sight, as everywhere else
            const member = linked && isInDomainScope(scope, linked.domainId) ? linked : undefined

            return {
                ...repository,
                // Already imported repositories keep the slug they were imported with, so it stays recognizable.
                slug: member?.slug ?? this.reserveSlug(repository.name, takenSlugs, target),
                alreadyImported: Boolean(linked),
                importedAs: member
                    ? {
                          _id: member._id.toString(),
                          slug: member.slug,
                          name: member.name
                      }
                    : undefined
            }
        })
    }

    /**
     * Creates one microfrontend, or one service with the service target, per selected repository, all in the
     * domain given. Repositories are imported independently: a single failure is reported back instead of
     * rolling back the whole batch.
     */
    async importRepositories(codeRepositoryId: string, body: ImportRepositoriesDTO = {}): Promise<ImportRepositoriesResult> {
        const codeRepositoryService = new CodeRepositoryService(this.user)
        const codeRepository = await codeRepositoryService.findById(codeRepositoryId)
        if (!codeRepository) {
            throw new EntityNotFoundError(codeRepositoryId)
        }

        // Imports into any domain, or none: a connection of the project is managed by those reaching all of it
        await this.ensureWholeProject(codeRepository.projectId)
        ensureTarget(body.target)
        const isService = body.target === "service"
        // Before anything is created: a domain of another project, or a missing one, refuses the whole batch
        const domainId = body.domainId !== undefined ? await resolveDomainId(body.domainId, codeRepository.projectId) : undefined
        const repositories = await this.fetchRepositories(codeRepositoryService, codeRepository, body.groupId)
        const linkedMembers = await this.getLinkedMembers(codeRepository)
        const takenSlugs = await this.getTakenSlugs(codeRepository.projectId, body.target)
        const host = isService ? undefined : await this.resolveHost(codeRepository.projectId)

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
            const alreadyImported = this.findLinkedMember(linkedMembers, repository)
            if (alreadyImported) {
                result.skipped.push({ repositoryId: repository.repositoryId, name: repository.name, reason: "ALREADY_IMPORTED" })
                continue
            }

            const slug = this.reserveSlug(repository.name, takenSlugs, body.target)
            if (isService && !SERVICE_SLUG.test(slug)) {
                // The slug names the CI registration URL of the service, which takes 2 to 50 characters only
                takenSlugs.delete(slug)
                result.failed.push({
                    repositoryId: repository.repositoryId,
                    name: repository.name,
                    error: `"${slug}" is not a valid service slug: 2 to 50 lowercase letters, digits or dashes. Create the service by hand with a shorter slug.`
                })
                continue
            }

            try {
                const common = {
                    name: repository.name,
                    slug,
                    description: repository.description,
                    projectId: toObjectId(codeRepository.projectId),
                    domainId,
                    codeRepository: this.buildMicrofrontendCodeRepository(codeRepository, repository, body.groupId)
                }
                const imported = { repositoryId: repository.repositoryId, name: repository.name, slug }

                if (isService) {
                    // The version is left to the CI, which registers the first one it builds, as for a service made from a template
                    const service = await Service.create(common as unknown as IService)
                    result.imported.push({ ...imported, serviceId: service._id.toString() })
                } else {
                    const microfrontend = await Microfrontend.create({ ...common, version: body.version || defaultVersion, host } as unknown as IMicrofrontend)
                    result.imported.push({ ...imported, microfrontendId: microfrontend._id.toString() })
                }
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

    async fetchRepositories(codeRepositoryService: CodeRepositoryService, codeRepository: ICodeRepository, groupId?: number): Promise<NormalizedRepository[]> {
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

    /** Whatever the target: a repository is the code of one microfrontend or of one service, never of both */
    private async getLinkedMembers(codeRepository: ICodeRepository): Promise<LinkedMember[]> {
        const linked = {
            projectId: toObjectId(codeRepository.projectId),
            "codeRepository.codeRepositoryId": toObjectId(codeRepository._id)
        }
        const [microfrontends, services] = await Promise.all([Microfrontend.find(linked), Service.find(linked)])
        return [...microfrontends, ...services]
    }

    /** Microfrontends and services have a slug space each, so only the target's is taken */
    private async getTakenSlugs(projectId: Schema.Types.ObjectId, target?: ImportTarget): Promise<Set<string>> {
        const filter = { projectId: toObjectId(projectId) }
        const members = target === "service" ? await Service.find(filter, { slug: 1 }) : await Microfrontend.find(filter, { slug: 1 })
        return new Set(members.map(member => member.slug))
    }

    private reserveSlug(name: string, takenSlugs: Set<string>, target: ImportTarget = "microfrontend"): string {
        const slug = buildUniqueSlug(name, takenSlugs, target)
        takenSlugs.add(slug)
        return slug
    }

    /**
     * Microfrontends and services created through the UI do not always carry the provider id (it is only known
     * once the repository exists), so the name is used as a fallback to recognize an already imported repository.
     */
    private findLinkedMember(members: LinkedMember[], repository: NormalizedRepository): LinkedMember | undefined {
        return members.find(member => {
            const linked = member.codeRepository
            if (!linked) return false
            if (linked.repositoryId && linked.repositoryId === repository.repositoryId) return true
            return Boolean(linked.name) && linked.name.toLowerCase() === repository.name.toLowerCase()
        })
    }

    buildMicrofrontendCodeRepository(codeRepository: ICodeRepository, repository: NormalizedRepository, groupId?: number): ICodeRepositoryMicrofrontend {
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
