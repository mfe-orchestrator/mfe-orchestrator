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
import Service, { IService, IServiceVariable } from "../models/ServiceModel"
import { MicrofrontendStackSource } from "../types/MicrofrontendStack"
import ServiceDTO, { ServiceVariableDTO, ServiceVersionRegistrationDTO } from "../types/ServiceDTO"
import { isServiceTemplateType, isServiceUrl, parseRuntime, SERVICE_SLUG, SERVICE_URL_MAX_LENGTH, SERVICE_VARIABLE_KEY, SERVICE_VERSION } from "../types/ServiceStack"
import { toObjectId } from "../utils/mongooseUtils"
import { isEncryptedSecret, SECRET_PLACEHOLDER } from "../utils/secretCrypto"
import BaseAuthorizedService from "./BaseAuthorizedService"
import { resolveDomainId } from "./DomainService"
import MarketService from "./MarketService"
import TemplateScaffoldService, { placeholderDomain } from "./TemplateScaffoldService"
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

/** Per list, as for env: well past any real service, short of a document Mongo would refuse */
const MAX_SERVICE_VARIABLES = 200
const MAX_SERVICE_VARIABLE_VALUE_LENGTH = 32 * 1024

type VariablesKind = "configMap" | "secrets"

/**
 * One list as it is stored: keys valid and unique, blank values dropped (the key stays unset in that
 * environment), every environment one of the project and at most once per key. A secret that comes
 * back as the placeholder keeps the value stored for that key and environment; with none to keep, it
 * is refused rather than saved literally.
 */
export const normalizeVariables = (variables: unknown, kind: VariablesKind, environmentIds: Set<string>, stored: IServiceVariable[] = []): ServiceVariableDTO[] => {
    if (!Array.isArray(variables) || variables.length > MAX_SERVICE_VARIABLES) {
        throw createBusinessException({ code: "SERVICE_VARIABLES_INVALID", message: `${kind} must be a list of at most ${MAX_SERVICE_VARIABLES} keys` })
    }

    const keys = new Set<string>()
    return variables.map((variable: ServiceVariableDTO) => {
        const key = typeof variable?.key === "string" ? variable.key.trim() : ""
        if (!SERVICE_VARIABLE_KEY.test(key)) {
            throw createBusinessException({ code: "SERVICE_VARIABLE_KEY_INVALID", message: `"${key}" is not a valid key: letters, digits and underscores, not starting with a digit` })
        }
        if (keys.has(key)) {
            throw createBusinessException({ code: "SERVICE_VARIABLE_KEY_DUPLICATED", message: `"${key}" appears more than once in ${kind}` })
        }
        keys.add(key)

        const environments = new Set<string>()
        const values = (Array.isArray(variable.values) ? variable.values : []).flatMap(item => {
            const { environmentId, value } = (item ?? {}) as { environmentId?: unknown; value?: unknown }
            if (typeof value !== "string" || value === "") return []

            const environment = String(environmentId)
            if (!environmentIds.has(environment)) {
                throw createBusinessException({ code: "SERVICE_VARIABLE_ENVIRONMENT_UNKNOWN", message: `"${key}" has a value for ${environment}, which is not an environment of the project` })
            }
            if (environments.has(environment)) {
                throw createBusinessException({ code: "SERVICE_VARIABLE_ENVIRONMENT_DUPLICATED", message: `"${key}" has more than one value for environment ${environment}` })
            }
            environments.add(environment)

            if (kind === "secrets" && value === SECRET_PLACEHOLDER) {
                const kept = stored.find(secret => secret.key === key)?.values.find(stored => String(stored.environmentId) === environment)?.value
                if (!kept) {
                    throw createBusinessException({ code: "SERVICE_SECRET_VALUE_REQUIRED", message: `The secret "${key}" has no stored value for environment ${environment} to keep: type it` })
                }
                return [{ environmentId: environment, value: kept }]
            }
            // Stored as typed, it would read as a ciphertext and make every load of the service fail to decrypt
            if (kind === "secrets" && isEncryptedSecret(value)) {
                throw createBusinessException({ code: "SERVICE_VARIABLE_VALUE_INVALID", message: `The value of "${key}" cannot start with "enc:v1:"` })
            }
            if (value.length > MAX_SERVICE_VARIABLE_VALUE_LENGTH) {
                throw createBusinessException({ code: "SERVICE_VARIABLE_VALUE_TOO_LONG", message: `The value of "${key}" exceeds ${MAX_SERVICE_VARIABLE_VALUE_LENGTH} characters` })
            }
            return [{ environmentId: environment, value }]
        })

        return { key, values }
    })
}

/**
 * The base URLs as they are stored: blank ones dropped (no known address in that environment), every
 * environment one of the project and at most once, every URL absolute http(s) without a trailing slash,
 * so that appending a path such as `/docs` gives a working link. The size guard counts the blank
 * entries too: it only bounds the request, the checks per entry give the precise refusal.
 */
export const normalizeUrls = (urls: unknown, environmentIds: Set<string>): Array<{ environmentId: string; url: string }> => {
    if (!Array.isArray(urls) || urls.length > MAX_SERVICE_VARIABLES) {
        throw createBusinessException({ code: "SERVICE_URLS_INVALID", message: `urls must be a list of at most ${MAX_SERVICE_VARIABLES} entries` })
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
 * The fields of `dto` with a value per environment (config map, secrets, URLs), normalised, when it
 * carries any: a caller that leaves them all out (an MCP update of the name, say) changes none and costs
 * no query. One key cannot be in both the config map and the secrets, since both end up as variables of
 * one container; a list left out is compared as it is stored.
 */
const withNormalizedEnvironmentFields = async <T extends Pick<ServiceDTO, "configMap" | "secrets" | "urls">>(dto: T, projectId: Schema.Types.ObjectId, existing?: IService): Promise<T> => {
    if (dto.configMap === undefined && dto.secrets === undefined && dto.urls === undefined) return dto

    const environmentIds = new Set((await Environment.find({ projectId }, { _id: 1 })).map(environment => String(environment._id)))
    const configMap = dto.configMap === undefined ? undefined : normalizeVariables(dto.configMap, "configMap", environmentIds)
    const secrets = dto.secrets === undefined ? undefined : normalizeVariables(dto.secrets, "secrets", environmentIds, existing?.secrets)
    const urls = dto.urls === undefined ? undefined : normalizeUrls(dto.urls, environmentIds)

    const secretKeys = new Set((secrets ?? existing?.secrets ?? []).map(secret => secret.key))
    const clash = (configMap ?? existing?.configMap ?? []).find(entry => secretKeys.has(entry.key))
    if (clash) {
        throw createBusinessException({ code: "SERVICE_VARIABLE_KEY_DUPLICATED", message: `"${clash.key}" is both in the config map and in the secrets` })
    }

    return { ...dto, ...(configMap && { configMap }), ...(secrets && { secrets }), ...(urls && { urls }) }
}

/**
 * The body the CI posts once it pushed an image. It arrives with an API key only, from a pipeline
 * nobody watches: a malformed one is refused with a 400 rather than stored half filled.
 */
const parseRegistration = (body: unknown): ServiceVersionRegistrationDTO => {
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
        return await Service.find({ projectId: projectIdObj }).sort({ name: 1 })
    }

    async create(dto: ServiceDTO, projectId: string | Schema.Types.ObjectId): Promise<IService> {
        const projectIdObj = toObjectId(projectId)
        await this.ensureAccessToProject(projectIdObj)

        // Normalised up front, as the model stores it: the scaffolded CI registers against this slug
        const slug = (dto.slug ?? "").trim().toLowerCase()
        ensureValidSlug(slug)
        const { id: _id, ...fields } = { ...dto, slug }
        const service = await withNormalizedEnvironmentFields(fields, projectIdObj)
        if (service.domainId !== undefined) {
            service.domainId = await resolveDomainId(service.domainId, projectIdObj)
        }

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
        const allowed = await withNormalizedEnvironmentFields(fields, service.projectId, service)
        if (allowed.domainId !== undefined) {
            allowed.domainId = await resolveDomainId(allowed.domainId, service.projectId)
        }
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
