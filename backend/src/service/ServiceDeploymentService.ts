import { createBusinessException } from "../errors/BusinessException"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import { ApiKeyRole } from "../models/ApiKeyModel"
import Environment from "../models/EnvironmentModel"
import ServiceDeployment, { IServiceDeployment, SERVICE_DEPLOYMENT_COMMIT_SHA_MAX_LENGTH, SERVICE_DEPLOYMENT_IMAGE_MAX_LENGTH } from "../models/ServiceDeploymentModel"
import Service from "../models/ServiceModel"
import { SERVICE_VERSION } from "../types/ServiceStack"
import { toObjectId } from "../utils/mongooseUtils"
import BaseAuthorizedService from "./BaseAuthorizedService"

export interface ServiceDeploymentRegistrationDTO {
    version: string
    image?: string
    commitSha?: string
}

/**
 * The body the deploy pipeline posts once a version runs in an environment. It arrives with an API key
 * only, from a pipeline nobody watches: a malformed one is refused with a 400 rather than stored half filled.
 */
export const parseRegistration = (body: unknown): ServiceDeploymentRegistrationDTO => {
    const registration = (body ?? {}) as Record<string, unknown>
    const version = typeof registration.version === "string" ? registration.version.trim() : registration.version
    if (typeof version !== "string" || !SERVICE_VERSION.test(version)) {
        throw createBusinessException({ code: "SERVICE_VERSION_INVALID", message: "The version may hold only letters, digits, dots, dashes and underscores (at most 128)" })
    }
    const optional = (field: "image" | "commitSha", maxLength: number) => {
        const value = registration[field]
        if (value === undefined || value === null) {
            return undefined
        }
        if (typeof value !== "string") {
            throw createBusinessException({ code: "SERVICE_VERSION_INVALID", message: `${field} must be a string` })
        }
        if (value.trim().length > maxLength) {
            throw createBusinessException({ code: "SERVICE_DEPLOYMENT_FIELD_TOO_LONG", message: `${field} exceeds ${maxLength} characters` })
        }
        return value.trim() || undefined
    }
    return {
        version,
        image: optional("image", SERVICE_DEPLOYMENT_IMAGE_MAX_LENGTH),
        commitSha: optional("commitSha", SERVICE_DEPLOYMENT_COMMIT_SHA_MAX_LENGTH)
    }
}

/**
 * The environment a deploy pipeline names by slug. Slugs are stored as typed (usually uppercase, e.g.
 * "PROD") and the unique index is case sensitive, so the slug is matched exactly first and without
 * regard to case only when that is unambiguous.
 */
export const findEnvironmentBySlug = async (projectId: ReturnType<typeof toObjectId>, environmentSlug: string) => {
    const wanted = environmentSlug.trim()
    const environments = await Environment.find({ projectId }, { _id: 1, slug: 1 })
    const sameCase = environments.find(environment => environment.slug === wanted)
    const anyCase = environments.filter(environment => environment.slug?.toLowerCase() === wanted.toLowerCase())
    if (!sameCase && anyCase.length > 1) {
        throw createBusinessException({
            code: "ENVIRONMENT_SLUG_AMBIGUOUS",
            message: `More than one environment matches "${wanted}" without regard to case: use the exact slug`,
            statusCode: 409
        })
    }
    const environment = sameCase ?? anyCase[0]
    if (!environment) {
        throw new EntityNotFoundError(environmentSlug)
    }
    return environment
}

export class ServiceDeploymentService extends BaseAuthorizedService {
    /**
     * Called by the deploy pipeline of the customer with the deploy API key once `version` of the service
     * runs in the environment. Every call is kept, the latest by date is the version running there. The
     * version need not be one the CI registered: an image built elsewhere is deployed all the same. Only a
     * MANAGER key may report a deploy, as only one may register a version.
     */
    async registerWithPermissionCheck(serviceSlug: string, environmentSlug: string, projectId: string, body: unknown, apiKeyRole?: ApiKeyRole): Promise<IServiceDeployment> {
        if (apiKeyRole !== ApiKeyRole.MANAGER) {
            throw createBusinessException({ code: "SERVICE_DEPLOYMENT_FORBIDDEN", message: "Reporting a deploy requires an API key with the MANAGER role", statusCode: 403 })
        }
        const registration = parseRegistration(body)

        const projectIdObj = toObjectId(projectId)
        const service = await Service.findOne({ slug: serviceSlug.trim().toLowerCase(), projectId: projectIdObj })
        if (!service) {
            throw new EntityNotFoundError(serviceSlug)
        }

        const environment = await findEnvironmentBySlug(projectIdObj, environmentSlug)

        return await ServiceDeployment.create({
            serviceId: service._id,
            environmentId: environment._id,
            version: registration.version,
            ...(registration.image && { image: registration.image }),
            ...(registration.commitSha && { commitSha: registration.commitSha })
        })
    }
}

export default ServiceDeploymentService
