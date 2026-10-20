import { ClientSession, isValidObjectId, ObjectId, Schema } from "mongoose"
import { createBusinessException } from "../errors/BusinessException"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import DomainLink, { IDomainLink } from "../models/DomainLinkModel"
import Domain from "../models/DomainModel"
import DomainLinkDTO from "../types/DomainLinkDTO"
import { toObjectId } from "../utils/mongooseUtils"
import BaseAuthorizedService from "./BaseAuthorizedService"

const linkExists = (source: string, target: string) => createBusinessException({ code: "DOMAIN_LINK_EXISTS", message: `Domain ${source} is already linked to domain ${target}`, statusCode: 409 })

/** A domain id of the body: a valid id, of a domain of the same project, or the link is refused */
const ensureDomainOfProject = async (field: string, value: unknown, projectId: Schema.Types.ObjectId) => {
    if (typeof value !== "string" || !isValidObjectId(value)) {
        throw createBusinessException({ code: "DOMAIN_LINK_INVALID", message: `${field} must be a domain identifier` })
    }
    if (!(await Domain.exists({ _id: toObjectId(value), projectId }))) {
        // A business exception rather than an EntityNotFoundError: the console translates it by its code
        throw createBusinessException({ code: "DOMAIN_NOT_FOUND", message: `There is no domain ${value} in this project`, statusCode: 404 })
    }
    return toObjectId(value)
}

export class DomainLinkService extends BaseAuthorizedService {
    async getByProjectId(projectId: string | Schema.Types.ObjectId): Promise<IDomainLink[]> {
        const projectIdObj = toObjectId(projectId)
        await this.ensureAccessToProject(projectIdObj)
        // Only the links a domain-scoped member sees both ends of
        const scope = await this.getDomainScope(projectIdObj)
        const visible = scope ? { sourceDomainId: { $in: scope.map(id => toObjectId(id)) }, targetDomainId: { $in: scope.map(id => toObjectId(id)) } } : {}
        return DomainLink.find({ projectId: projectIdObj, ...visible }).sort({ createdAt: 1 })
    }

    /** Links two domains of the project, one way: a link back is a relation of its own */
    async create(dto: DomainLinkDTO, projectId: string | Schema.Types.ObjectId): Promise<IDomainLink> {
        const projectIdObj = toObjectId(projectId)
        await this.ensureAccessToProject(projectIdObj)
        // The links between domains are part of the map of the whole project, as the domains are
        await this.ensureWholeProject(projectIdObj)
        if (dto?.label !== undefined && dto.label !== null && typeof dto.label !== "string") {
            throw createBusinessException({ code: "DOMAIN_LINK_INVALID", message: "label must be a string" })
        }
        const sourceDomainId = await ensureDomainOfProject("sourceDomainId", dto?.sourceDomainId, projectIdObj)
        const targetDomainId = await ensureDomainOfProject("targetDomainId", dto?.targetDomainId, projectIdObj)
        if (String(sourceDomainId) === String(targetDomainId)) {
            throw createBusinessException({ code: "DOMAIN_LINK_INVALID", message: "A domain cannot be linked to itself" })
        }
        if (await DomainLink.exists({ projectId: projectIdObj, sourceDomainId, targetDomainId })) {
            throw linkExists(dto.sourceDomainId, dto.targetDomainId)
        }
        try {
            return await DomainLink.create({ projectId: projectIdObj, sourceDomainId, targetDomainId, label: dto.label?.trim() || undefined })
        } catch (error) {
            // A concurrent create of the same link passed the check above: the unique index decides
            if ((error as { code?: number })?.code === 11000) {
                throw linkExists(dto.sourceDomainId, dto.targetDomainId)
            }
            if ((error as Error)?.name === "ValidationError") {
                throw createBusinessException({ code: "DOMAIN_LINK_INVALID", message: (error as Error).message })
            }
            throw error
        }
    }

    async delete(id: string | ObjectId): Promise<IDomainLink | null> {
        const link = await DomainLink.findById(toObjectId(id))
        if (!link) {
            throw new EntityNotFoundError(String(id))
        }
        await this.ensureAccessToProject(link.projectId)
        await this.ensureWholeProject(link.projectId)
        return DomainLink.findByIdAndDelete(link._id)
    }
}

/** Drops the links of a domain that is being deleted, inside its transaction */
export const deleteLinksOfDomain = (domainId: ObjectId | Schema.Types.ObjectId, session?: ClientSession) => {
    const id = toObjectId(domainId)
    return DomainLink.deleteMany({ $or: [{ sourceDomainId: id }, { targetDomainId: id }] }, { session })
}

export default DomainLinkService
