import { isValidObjectId, ObjectId, Schema } from "mongoose"
import { createBusinessException } from "../errors/BusinessException"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import Domain, { IDomain } from "../models/DomainModel"
import Microfrontend from "../models/MicrofrontendModel"
import Service from "../models/ServiceModel"
import UserProject from "../models/UserProjectModel"
import DomainDTO, { DomainMembersDTO } from "../types/DomainDTO"
import { toObjectId } from "../utils/mongooseUtils"
import { runInTransaction } from "../utils/runInTransaction"
import { slugify } from "../utils/slugUtils"
import BaseAuthorizedService from "./BaseAuthorizedService"
import { deleteLinksOfDomain } from "./DomainLinkService"

/**
 * The domain a microfrontend or a service is put in, as it is stored: null when it is taken out of
 * any. A domain of another project is refused as missing, as a code repository connection is:
 * membership must never reach across projects.
 */
export const resolveDomainId = async (domainId: unknown, projectId: string | Schema.Types.ObjectId): Promise<string | null> => {
    if (domainId === null || domainId === "") {
        return null
    }
    if (typeof domainId !== "string" || !isValidObjectId(domainId)) {
        throw createBusinessException({ code: "DOMAIN_INVALID", message: `Invalid domain identifier: ${JSON.stringify(domainId)}` })
    }
    if (!(await Domain.exists({ _id: toObjectId(domainId), projectId: toObjectId(projectId) }))) {
        // A business exception rather than an EntityNotFoundError: the console translates it by its code
        throw createBusinessException({ code: "DOMAIN_NOT_FOUND", message: `There is no domain ${domainId} in this project`, statusCode: 404 })
    }
    return domainId
}

/** A body field that must be a string when given: anything else is refused with a 400, not a 500 on `.trim()` */
const ensureOptionalString = (field: string, value: unknown) => {
    if (value !== undefined && value !== null && typeof value !== "string") {
        throw createBusinessException({ code: "DOMAIN_INVALID", message: `${field} must be a string` })
    }
}

/** A body field that must be a list of ids when given: anything else is refused with a 400 */
const ensureIdList = (field: string, value: unknown) => {
    if (value === undefined || value === null) {
        return []
    }
    if (!Array.isArray(value) || !value.every(id => typeof id === "string" && isValidObjectId(id))) {
        throw createBusinessException({ code: "DOMAIN_INVALID", message: `${field} must be a list of identifiers` })
    }
    return value.map(id => toObjectId(id as string))
}

/** What the database refuses, as the caller should see it: a 409 for a taken slug, a 400 for a value out of the schema */
const toDomainError = (error: unknown, slug?: string): unknown => {
    if ((error as { code?: number })?.code === 11000) {
        return createBusinessException({ code: "DOMAIN_SLUG_TAKEN", message: `A domain with slug "${slug}" already exists in this project`, statusCode: 409 })
    }
    if ((error as Error)?.name === "ValidationError") {
        return createBusinessException({ code: "DOMAIN_INVALID", message: (error as Error).message })
    }
    return error
}

const countBy = (members: { domainId?: unknown }[]): Map<string, number> => {
    const counts = new Map<string, number>()
    for (const member of members) {
        const key = String(member.domainId)
        counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return counts
}

export class DomainService extends BaseAuthorizedService {
    async getById(id: string | ObjectId): Promise<IDomain | null> {
        const domain = await Domain.findById(toObjectId(id))
        if (!domain) {
            return null
        }
        await this.ensureAccessToProject(domain.projectId)
        await this.ensureInDomainScope(domain.projectId, domain._id)
        return domain
    }

    /** The domains of the project, each with how many microfrontends and services it groups */
    async getByProjectId(projectId: string | Schema.Types.ObjectId) {
        const projectIdObj = toObjectId(projectId)
        await this.ensureAccessToProject(projectIdObj)
        // The counts need no filter of their own: every member of a domain in scope is in scope too
        const inScope = await this.domainScopeFilter(projectIdObj, "_id")
        const [domains, microfrontends, services] = await Promise.all([
            Domain.find({ projectId: projectIdObj, ...inScope }).sort({ name: 1 }),
            Microfrontend.find({ projectId: projectIdObj, domainId: { $ne: null } }, { domainId: 1 }),
            Service.find({ projectId: projectIdObj, domainId: { $ne: null } }, { domainId: 1 })
        ])
        const microfrontendCounts = countBy(microfrontends)
        const serviceCounts = countBy(services)
        return domains.map(domain => ({
            ...domain.toObject(),
            microfrontendsCount: microfrontendCounts.get(String(domain._id)) ?? 0,
            servicesCount: serviceCounts.get(String(domain._id)) ?? 0
        }))
    }

    async create(dto: DomainDTO, projectId: string | Schema.Types.ObjectId): Promise<IDomain> {
        const projectIdObj = toObjectId(projectId)
        await this.ensureAccessToProject(projectIdObj)
        // The domains are the map of the whole project: drawn by those who reach all of it
        await this.ensureWholeProject(projectIdObj)

        ensureOptionalString("name", dto.name)
        ensureOptionalString("slug", dto.slug)
        ensureOptionalString("description", dto.description)
        ensureOptionalString("context", dto.context)
        const name = (dto.name ?? "").trim()
        if (!name) {
            throw createBusinessException({ code: "DOMAIN_NAME_REQUIRED", message: "The domain name is required" })
        }
        const slug = slugify(dto.slug?.trim() || name)
        if (!slug) {
            throw createBusinessException({ code: "DOMAIN_SLUG_INVALID", message: `"${name}" gives no usable slug: use at least one letter or digit` })
        }
        if (await Domain.exists({ slug, projectId: projectIdObj })) {
            throw createBusinessException({ code: "DOMAIN_SLUG_TAKEN", message: `A domain with slug "${slug}" already exists in this project`, statusCode: 409 })
        }

        try {
            return await Domain.create({ name, slug, description: dto.description ?? undefined, context: dto.context || undefined, projectId: projectIdObj })
        } catch (error) {
            // A concurrent create of the same slug passed the check above: the unique index decides
            throw toDomainError(error, slug)
        }
    }

    async update(id: string | ObjectId, updates: DomainDTO): Promise<IDomain | null> {
        const domain = await this.getById(id)
        if (!domain) {
            throw new EntityNotFoundError(String(id))
        }
        await this.ensureWholeProject(domain.projectId)
        // Never moved to another project nor given another slug through an update
        ensureOptionalString("name", updates.name)
        ensureOptionalString("description", updates.description)
        ensureOptionalString("context", updates.context)
        const allowed: Partial<DomainDTO> = {}
        if (updates.name !== undefined && updates.name !== null) {
            if (!updates.name.trim()) {
                throw createBusinessException({ code: "DOMAIN_NAME_REQUIRED", message: "The domain name is required" })
            }
            allowed.name = updates.name
        }
        if (updates.description !== undefined) {
            allowed.description = updates.description
        }
        if (updates.context !== undefined) {
            allowed.context = updates.context
        }
        try {
            return await Domain.findByIdAndUpdate(domain._id, allowed, { new: true, runValidators: true })
        } catch (error) {
            throw toDomainError(error, domain.slug)
        }
    }

    /**
     * Puts microfrontends and services in the domain, taking them out of the one they were in. Only members of
     * the domain's project are moved: an id of another project is left as it is, never pulled across projects.
     */
    async addMembers(id: string | ObjectId, dto: DomainMembersDTO): Promise<{ microfrontends: number; services: number }> {
        const domain = await this.getById(id)
        if (!domain) {
            throw new EntityNotFoundError(String(id))
        }
        // Moving members between domains moves them in or out of the scopes of other members
        await this.ensureWholeProject(domain.projectId)
        const microfrontendIds = ensureIdList("microfrontendIds", dto?.microfrontendIds)
        const serviceIds = ensureIdList("serviceIds", dto?.serviceIds)
        return runInTransaction(async session => {
            const membership = { $set: { domainId: domain._id } }
            const microfrontends = await Microfrontend.updateMany({ _id: { $in: microfrontendIds }, projectId: domain.projectId }, membership, { session })
            const services = await Service.updateMany({ _id: { $in: serviceIds }, projectId: domain.projectId }, membership, { session })
            return { microfrontends: microfrontends.matchedCount, services: services.matchedCount }
        })
    }

    /**
     * Deletes the domain only: its microfrontends and services stay, without a domain. The memberships
     * scoped to it lose it from their scope and stay scoped, even when it was their last domain: they
     * then reach nothing rather than the whole project, until an owner gives them a new scope.
     */
    async delete(id: string | ObjectId): Promise<IDomain | null> {
        const domain = await this.getById(id)
        if (!domain) {
            throw new EntityNotFoundError(String(id))
        }
        await this.ensureWholeProject(domain.projectId)
        return runInTransaction(async session => {
            const members = { projectId: domain.projectId, domainId: domain._id }
            // null, as the forms store "no domain": the filters and the counts treat it as a missing domainId
            await Microfrontend.updateMany(members, { $set: { domainId: null } }, { session })
            await Service.updateMany(members, { $set: { domainId: null } }, { session })
            await UserProject.updateMany({ projectId: domain.projectId, domainIds: domain._id }, { $pull: { domainIds: domain._id } }, { session })
            await deleteLinksOfDomain(domain._id, session)
            return await Domain.findByIdAndDelete(domain._id, { session })
        })
    }
}

export default DomainService
