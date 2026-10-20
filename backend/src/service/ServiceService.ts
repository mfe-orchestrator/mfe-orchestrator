import { ObjectId, Schema } from "mongoose"
import { createBusinessException } from "../errors/BusinessException"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import { ProjectNotFoundError } from "../errors/ProjectNotFoundError"
import { ApiKeyRole } from "../models/ApiKeyModel"
import BuiltService, { IBuiltService } from "../models/BuiltServiceModel"
import CodeRepository from "../models/CodeRepositoryModel"
import Environment from "../models/EnvironmentModel"
import Project from "../models/ProjectModel"
import ServiceDeployment from "../models/ServiceDeploymentModel"
import Service, { IService } from "../models/ServiceModel"
import { MicrofrontendStackSource } from "../types/MicrofrontendStack"
import ServiceDTO, { ServiceVersionRegistrationDTO } from "../types/ServiceDTO"
import { isServiceTemplateType, isServiceUrl, parseRuntime, SERVICE_SLUG, SERVICE_URL_MAX_LENGTH, SERVICE_VERSION } from "../types/ServiceStack"
import { toObjectId } from "../utils/mongooseUtils"
import BaseAuthorizedService, { ensureOnlyNewRepositoryLinked, ensureRepositoryLinkUnchanged } from "./BaseAuthorizedService"
import { resolveDomainId } from "./DomainService"
import MarketService from "./MarketService"
import TemplateScaffoldService, { placeholderDomain } from "./TemplateScaffoldService"
import { ensureAttachableMaps, resolveAttachedMaps } from "./VariableMapService"
import { forgetServices } from "./workspace/workspaceCleanup"

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0

const isDuplicateKeyError = (error: unknown): boolean => (error as { code?: number })?.code === 11000

/** Checked before anything is created at the provider: the slug names the repository folder and the CI registration URL */
const ensureValidSlug = (slug: string) => {
    if (!SERVICE_SLUG.test(slug)) {
        throw createBusinessException({
            code: "SERVICE_SLUG_INVALID",
            message: `"${slug}" is not a valid slug: 2 to 50 lowercase letters, digits or dashes, not starting with a dash`
        })
    }
}

/** As for env: well past any real service, short of a document Mongo would refuse */
const MAX_SERVICE_URLS = 200

/**
 * The base URLs as they are stored: blank ones dropped (no known address in that environment), every
 * environment one of the project and at most once, every URL absolute http(s) without a trailing slash,
 * so that appending a path such as `/docs` gives a working link. The size guard counts the blank
 * entries too: it only bounds the request, the checks per entry give the precise refusal.
 */
export const normalizeUrls = (urls: unknown, environmentIds: Set<string>): Array<{ environmentId: string; url: string }> => {
    if (!Array.isArray(urls) || urls.length > MAX_SERVICE_URLS) {
        throw createBusinessException({ code: "SERVICE_URLS_INVALID", message: `urls must be a list of at most ${MAX_SERVICE_URLS} entries` })
    }

    const environments = new Set<string>()
    return urls.flatMap(item => {
        const { environmentId, url } = (item ?? {}) as { environmentId?: unknown; url?: unknown }
        const typed = typeof url === "string" ? url.trim() : ""
        if (!typed) return []
        const value = typed.replace(/\/+$/, "")

        const environment = String(environmentId)
        if (!environmentIds.has(environment)) {
            throw createBusinessException({ code: "SERVICE_URL_ENVIRONMENT_UNKNOWN", message: `There is a URL for ${environment}, which is not an environment of the project` })
        }
        if (environments.has(environment)) {
            throw createBusinessException({ code: "SERVICE_URL_ENVIRONMENT_DUPLICATED", message: `There is more than one URL for environment ${environment}` })
        }
        environments.add(environment)

        if (!isServiceUrl(value)) {
            throw createBusinessException({
                code: "SERVICE_URL_INVALID",
                message: `"${typed}" is not a valid URL: absolute http or https, at most ${SERVICE_URL_MAX_LENGTH} characters, without whitespace, credentials, query or fragment`
            })
        }
        return [{ environmentId: environment, url: value }]
    })
}

/**
 * Refuses update operators and dotted paths: `{"$set": {"secretIds": [...]}}` or `{"secretIds.0": ...}`
 * would reach Mongo past every check here, attaching a secret of another project to this service.
 */
export const ensurePlainFields = (fields: object, code = "SERVICE_INVALID") => {
    const key = Object.keys(fields).find(candidate => candidate.startsWith("$") || candidate.includes("."))
    if (key) {
        throw createBusinessException({ code, message: `"${key}" is not a field: update operators and dotted paths are refused` })
    }
}

/**
 * The base URLs of `dto`, normalised, and the maps it attaches, checked: a caller that leaves them out
 * (an MCP update of the name, say) changes none of them and costs no query. A FRONTEND microfrontend
 * goes through it too, since it has the same container fields.
 */
export const withNormalizedReferences = async <T extends Pick<ServiceDTO, "urls" | "configMapIds" | "secretIds">>(
    dto: T,
    projectId: Schema.Types.ObjectId,
    existing?: Partial<Pick<IService, "name" | "configMapIds" | "secretIds">>
): Promise<T> => {
    ensurePlainFields(dto)
    // Only the name and the attached ids of what is stored are read
    const withMaps = await resolveAttachedMaps(dto, projectId, existing as IService | undefined)
    if (dto.urls === undefined) return withMaps

    const environmentIds = new Set((await Environment.find({ projectId }, { _id: 1 })).map(environment => String(environment._id)))
    return { ...withMaps, urls: normalizeUrls(dto.urls, environmentIds) }
}

/**
 * The body the CI posts once it pushed an image. It arrives with an API key only, from a pipeline
 * nobody watches: a malformed one is refused with a 400 rather than stored half filled.
 */
export const parseRegistration = (body: unknown): ServiceVersionRegistrationDTO => {
    const registration = (body ?? {}) as Record<string, unknown>
    if (!isNonEmptyString(registration.image)) {
        throw createBusinessException({ code: "SERVICE_VERSION_IMAGE_REQUIRED", message: "The image reference is required, e.g. ghcr.io/acme/orders-api:1.2.0" })
    }
    for (const field of ["digest", "commitSha"] as const) {
        if (registration[field] !== undefined && typeof registration[field] !== "string") {
            throw createBusinessException({ code: "SERVICE_VERSION_INVALID", message: `${field} must be a string` })
        }
    }
    return {
        image: registration.image.trim(),
        digest: (registration.digest as string | undefined)?.trim() || undefined,
        commitSha: (registration.commitSha as string | undefined)?.trim() || undefined
    }
}

/**
 * The repository part of an image reference, without tag nor digest:
 * `host:5000/acme/orders:1.2.0@sha256:…` → `host:5000/acme/orders`. A colon before the last slash
 * is a registry port, not a tag.
 */
export const imageRepositoryOf = (image: string): string => {
    const withoutDigest = image.split("@")[0]
    const tagAt = withoutDigest.lastIndexOf(":")
    return tagAt > withoutDigest.lastIndexOf("/") ? withoutDigest.slice(0, tagAt) : withoutDigest
}

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

/** Semver precedence of two pre-release tags (`alpha.1` < `alpha.2` < `beta`). */
const comparePrerelease = (a: string, b: string): number => {
    const left = a.split(".")
    const right = b.split(".")
    for (let index = 0; index < Math.min(left.length, right.length); index++) {
        const [x, y] = [left[index], right[index]]
        const [xNumeric, yNumeric] = [/^\d+$/.test(x), /^\d+$/.test(y)]
        if (xNumeric && yNumeric && Number(x) !== Number(y)) return Number(x) - Number(y)
        if (xNumeric !== yNumeric) return xNumeric ? -1 : 1
        if (x !== y) return x < y ? -1 : 1
    }
    return left.length - right.length
}

/**
 * Whether `candidate` should become the latest version of a service: always when it has none yet,
 * otherwise only when both are semver and `candidate` is newer. Tags that are not semver (`latest`,
 * a commit sha) cannot be ordered: they are registered as versions but never move the service.
 */
export const isNewerVersion = (candidate: string, current?: string): boolean => {
    if (!current?.trim()) return true
    const next = SEMVER.exec(candidate)
    const previous = SEMVER.exec(current)
    if (!next || !previous) return false
    for (let part = 1; part <= 3; part++) {
        const difference = Number(next[part]) - Number(previous[part])
        if (difference !== 0) return difference > 0
    }
    // A release ranks above its pre-releases.
    if (!next[4] || !previous[4]) return !next[4] && Boolean(previous[4])
    return comparePrerelease(next[4], previous[4]) > 0
}

export class ServiceService extends BaseAuthorizedService {
    async getById(id: string | ObjectId): Promise<IService | null> {
        const service = await Service.findById(toObjectId(id))
        if (!service) {
            return null
        }
        await this.ensureAccessToService(service)
        return service
    }

    async getByProjectId(projectId: string | Schema.Types.ObjectId): Promise<IService[]> {
        const projectIdObj = toObjectId(projectId)
        await this.ensureAccessToProject(projectIdObj)
        return await Service.find({ projectId: projectIdObj, ...(await this.domainScopeFilter(projectIdObj)) }).sort({ name: 1 })
    }

    async create(dto: ServiceDTO, projectId: string | Schema.Types.ObjectId): Promise<IService> {
        const projectIdObj = toObjectId(projectId)
        await this.ensureAccessToProject(projectIdObj)

        // Normalised up front, as the model stores it: the scaffolded CI registers against this slug
        const slug = (dto.slug ?? "").trim().toLowerCase()
        ensureValidSlug(slug)
        const { id: _id, ...fields } = { ...dto, slug }
        const service = await withNormalizedReferences(fields, projectIdObj)
        if (service.domainId !== undefined) {
            service.domainId = await resolveDomainId(service.domainId, projectIdObj)
        }
        // A domain-scoped member creates only inside their domains: one in no domain would be out of their reach at once
        await this.ensureInDomainScope(projectIdObj, service.domainId)
        const scope = await this.getDomainScope(projectIdObj)
        await ensureAttachableMaps(scope, projectIdObj, service)
        ensureOnlyNewRepositoryLinked(scope, service.codeRepository)

        // Both before the repository is created: a refused save would leave an orphan repository behind
        if (await Service.exists({ slug, projectId: projectIdObj })) {
            throw createBusinessException({ code: "SERVICE_SLUG_TAKEN", message: `A service with slug "${slug}" already exists in this project`, statusCode: 409 })
        }
        try {
            await new Service({ ...service, projectId: projectIdObj }).validate()
        } catch (error) {
            throw createBusinessException({ code: "SERVICE_INVALID", message: (error as Error).message })
        }

        if (service.codeRepository?.enabled) {
            const codeRepository = await CodeRepository.findById(service.codeRepository.codeRepositoryId)
            // A connection of another project would lend this one its access token
            if (!codeRepository || String(codeRepository.projectId) !== String(projectIdObj)) {
                throw new EntityNotFoundError(String(service.codeRepository.codeRepositoryId))
            }

            const createData = service.codeRepository.createData
            if (createData) {
                await this.ensureNotViewer(projectIdObj, { code: "REPOSITORY_CREATE_FORBIDDEN", message: "A viewer cannot create a code repository" })
                const template = createData.template ? await new MarketService().getSingle(createData.template) : null
                // Both checked before anything is created at the provider
                if (createData.template && !template) {
                    throw createBusinessException({ code: "TEMPLATE_NOT_FOUND", message: `There is no template "${createData.template}"` })
                }
                if (template && !isServiceTemplateType(template.type)) {
                    throw createBusinessException({
                        code: "MICROFRONTEND_TEMPLATE_NOT_ALLOWED",
                        message: `"${template.slug}" is a microfrontend template: create a microfrontend from it, not a service`
                    })
                }

                await new TemplateScaffoldService(this.user).createRepository(codeRepository, service.codeRepository, slug, template, {
                    placeholders: { "%serviceSlug%": slug, "%domain%": placeholderDomain() }
                })

                if (template) {
                    // What the form or the API caller left out comes from the template, the platform defaults after it
                    const defaults = template.serviceDefaults
                    if (defaults) {
                        service.port ??= defaults.port
                        service.livenessPath ??= defaults.livenessPath
                        service.readinessPath ??= defaults.readinessPath
                        service.docsPath ??= defaults.docsPath
                        service.openApiPath ??= defaults.openApiPath
                    }
                    service.template = template.slug
                    service.stack = {
                        runtime: parseRuntime(template.framework),
                        framework: template.framework,
                        source: MicrofrontendStackSource.TEMPLATE
                    }
                }

                service.codeRepository.createData = undefined
            }
        }

        return await Service.create({ ...service, projectId: projectIdObj } as unknown as IService)
    }

    async update(id: string | ObjectId, updates: ServiceDTO): Promise<IService | null> {
        const service = await this.getById(id)
        if (!service) {
            throw new EntityNotFoundError(String(id))
        }

        // Never moved to another project, nor given another identity, through an update: the slug is
        // in the registration URL the CI of the repository calls
        const { id: _id, _id: _mongoId, projectId: _projectId, slug: _slug, ...fields } = updates as Partial<ServiceDTO> & { _id?: unknown; projectId?: unknown }
        const allowed = await withNormalizedReferences(fields, service.projectId, service)
        if (allowed.domainId !== undefined) {
            allowed.domainId = await resolveDomainId(allowed.domainId, service.projectId)
            // Moved only between the domains of a domain-scoped member, never out of their reach
            await this.ensureInDomainScope(service.projectId, allowed.domainId)
        }
        const scope = await this.getDomainScope(service.projectId)
        await ensureAttachableMaps(scope, service.projectId, allowed, service)
        if (ensureRepositoryLinkUnchanged(scope, allowed.codeRepository, service.codeRepository)) delete allowed.codeRepository
        if (allowed.codeRepository) {
            allowed.codeRepository = { ...allowed.codeRepository, createData: undefined }
            if (allowed.codeRepository.enabled || allowed.codeRepository.codeRepositoryId) {
                const codeRepository = await CodeRepository.findById(allowed.codeRepository.codeRepositoryId)
                // A connection of another project would lend this one its access token, as in create
                if (!codeRepository || String(codeRepository.projectId) !== String(service.projectId)) {
                    throw new EntityNotFoundError(String(allowed.codeRepository.codeRepositoryId))
                }
            }
        }
        return await Service.findByIdAndUpdate(service._id, allowed, { new: true, runValidators: true })
    }

    async delete(id: string | ObjectId): Promise<IService | null> {
        const service = await this.getById(id)
        if (!service) {
            throw new EntityNotFoundError(String(id))
        }
        await BuiltService.deleteMany({ serviceId: service._id })
        await ServiceDeployment.deleteMany({ serviceId: service._id })
        const deleted = await Service.findByIdAndDelete(service._id)
        // The local clone and the AI change requests go with it, as for a microfrontend.
        await forgetServices([service])
        return deleted
    }

    /** Registered versions, newest first */
    async getVersionsById(id: string): Promise<IBuiltService[]> {
        const service = await this.getById(id)
        if (!service) {
            throw new EntityNotFoundError(id)
        }
        return await BuiltService.find({ serviceId: service._id }).sort({ createdAt: -1 })
    }

    /** Tags the repository with `version`: the tag starts the pipeline that builds and pushes the image */
    async build(id: string, version: string, branch?: string): Promise<void> {
        // It becomes a git tag and then, in the pipeline, an image tag and a URL segment
        if (typeof version !== "string" || !SERVICE_VERSION.test(version)) {
            throw createBusinessException({ code: "SERVICE_VERSION_INVALID", message: "The version may hold only letters, digits, dots, dashes and underscores (at most 128)" })
        }
        const service = await this.getById(id)
        if (!service) {
            throw new EntityNotFoundError(id)
        }
        await new TemplateScaffoldService(this.user).createTag(service.codeRepository, service.projectId, version, branch)
    }

    /**
     * Called by the CI with the deploy API key once the image of `version` is pushed. Registering
     * the same version again (a rerun of the pipeline) replaces what was stored for it. The service
     * moves to `version` only when it is newer than its current one, and learns its image repository
     * from the first registration when nobody set it. Only a MANAGER key may register: the deploy
     * secret is one, a VIEWER key handed out to read the project is not meant to publish images.
     */
    async registerVersionWithPermissionCheck(serviceSlug: string, version: string, projectId: string, body: unknown, apiKeyRole?: ApiKeyRole): Promise<IBuiltService> {
        if (apiKeyRole !== ApiKeyRole.MANAGER) {
            throw createBusinessException({ code: "SERVICE_VERSION_FORBIDDEN", message: "Registering a version requires an API key with the MANAGER role", statusCode: 403 })
        }
        const registration = parseRegistration(body)
        if (!isNonEmptyString(version)) {
            throw createBusinessException({ code: "SERVICE_VERSION_INVALID", message: "The version is required" })
        }

        const project = await Project.findById(projectId)
        if (!project) {
            throw new ProjectNotFoundError(projectId)
        }
        const service = await Service.findOne({ slug: serviceSlug.trim().toLowerCase(), projectId: toObjectId(projectId) })
        if (!service) {
            throw new EntityNotFoundError(serviceSlug)
        }

        const trimmedVersion = version.trim()
        const unset: Record<string, ""> = {}
        if (!registration.digest) unset.digest = ""
        if (!registration.commitSha) unset.commitSha = ""

        const upsert = () =>
            BuiltService.findOneAndUpdate(
                { serviceId: service._id, version: trimmedVersion },
                {
                    $set: {
                        image: registration.image,
                        ...(registration.digest && { digest: registration.digest }),
                        ...(registration.commitSha && { commitSha: registration.commitSha })
                    },
                    ...(Object.keys(unset).length > 0 && { $unset: unset })
                },
                { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
            )
        let built
        try {
            built = await upsert()
        } catch (error) {
            // Two runs of the same tag upserting at once: one inserted, the other now finds it and updates
            if (!isDuplicateKeyError(error)) throw error
            built = await upsert()
        }

        // Compare and set on the version that was read, so two pipelines finishing together cannot
        // move the service back to the older of the two: the loser reads again and decides again.
        let current: IService | null = service
        for (let attempt = 0; current && attempt < 3; attempt++) {
            const updates: Record<string, string> = {}
            if (isNewerVersion(trimmedVersion, current.version)) updates.version = trimmedVersion
            if (!current.image?.repository?.trim()) updates["image.repository"] = imageRepositoryOf(registration.image)
            if (Object.keys(updates).length === 0) break
            const result = await Service.updateOne({ _id: service._id, version: current.version ?? null }, { $set: updates })
            if (result.matchedCount > 0) break
            current = await Service.findById(service._id)
        }

        return built as IBuiltService
    }
}

export default ServiceService
