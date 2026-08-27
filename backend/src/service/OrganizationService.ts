import { ClientSession, DeleteResult, ObjectId, Schema } from "mongoose"
import { fastify } from ".."
import { BusinessException, createBusinessException } from "../errors/BusinessException"
import { OrganizationNotFoundError } from "../errors/OrganizationNotFoundError"
import Organization, { IOrganization } from "../models/OrganizationModel"
import Project from "../models/ProjectModel"
import UserOrganization, { RoleInOrganization } from "../models/UserOrganizationModel"
import { toObjectId } from "../utils/mongooseUtils"
import { runInTransaction } from "../utils/runInTransaction"
import { slugify } from "../utils/slugUtils"
import BaseAuthorizedService from "./BaseAuthorizedService"

export interface OrganizationCreateInput {
    name: string
    slug?: string
    description?: string
}

export interface OrganizationUpdateInput {
    name?: string
    description?: string | null
}

/** An organization as the signed-in user sees it: the role is what the frontend gates its actions on. */
export interface IOrganizationWithRole extends IOrganization {
    role: RoleInOrganization
}

export interface OrganizationSummaryDTO {
    organization: IOrganization
    role: RoleInOrganization
    count: {
        projects: number
        users: number
    }
}

export class OrganizationService extends BaseAuthorizedService {
    /**
     * The organizations the user belongs to, with the role they hold in each.
     *
     * Pending invitations are left out for the same reason they are left out of the project list:
     * an invitation is not a membership until it is answered, and showing it in the switcher would
     * let the user step into an organization they never accepted.
     */
    async findMine(userId: ObjectId | string): Promise<IOrganizationWithRole[]> {
        try {
            return await UserOrganization.aggregate<IOrganizationWithRole>([
                { $match: { userId: toObjectId(userId), invitationToken: null } },
                {
                    $lookup: {
                        from: "organizations",
                        localField: "organizationId",
                        foreignField: "_id",
                        as: "organization"
                    }
                },
                { $unwind: "$organization" },
                { $addFields: { "organization.role": "$role" } },
                { $replaceRoot: { newRoot: "$organization" } },
                { $sort: { name: 1 } }
            ])
        } catch (error) {
            throw createBusinessException({
                code: "ORGANIZATION_FETCH_ERROR",
                message: "Failed to fetch organizations",
                details: { error: error instanceof Error ? error.message : "Unknown error" },
                statusCode: 500
            })
        }
    }

    async findById(organizationId: string | Schema.Types.ObjectId, session?: ClientSession): Promise<IOrganization | null> {
        await this.ensureAccessToOrganization(organizationId, session)
        return Organization.findById(toObjectId(organizationId), {}, { session })
    }

    async getSummary(organizationId: string | Schema.Types.ObjectId): Promise<OrganizationSummaryDTO> {
        const organizationIdObj = toObjectId(organizationId)
        await this.ensureAccessToOrganization(organizationIdObj)

        const organization = await Organization.findById(organizationIdObj)
        if (!organization) {
            throw new OrganizationNotFoundError(organizationIdObj.toString())
        }

        const role = await this.getRoleInOrganization(organizationIdObj)

        return {
            organization,
            role: role as RoleInOrganization,
            count: {
                projects: await Project.countDocuments({ organizationId: organizationIdObj }),
                // Pending invitations are counted in: from the administrator's side they are seats
                // already handed out, and the members page lists them.
                users: await UserOrganization.countDocuments({ organizationId: organizationIdObj })
            }
        }
    }

    /** Anybody may open an organization of their own: creating one is what makes a new account usable. */
    async create(input: OrganizationCreateInput, creatorUserId: ObjectId | string): Promise<IOrganization> {
        return runInTransaction(session => this.createRaw(input, creatorUserId, session))
    }

    async createRaw(input: OrganizationCreateInput, creatorUserId: ObjectId | string, session?: ClientSession): Promise<IOrganization> {
        if (!input.name?.trim()) {
            throw createBusinessException({
                code: "ORGANIZATION_NAME_REQUIRED",
                message: "An organization name is required"
            })
        }

        const organization = new Organization({
            name: input.name.trim(),
            slug: input.slug?.trim() || slugify(input.name),
            description: input.description
        })

        const saved = await organization.save({ session })
        fastify.log.info("Organization created with ID:" + saved._id)

        // The creator owns what they created: an organization with no owner could never be
        // administered, and no other row grants that.
        await new UserOrganization({
            userId: toObjectId(creatorUserId),
            organizationId: saved._id,
            role: RoleInOrganization.OWNER
        }).save({ session })

        return saved
    }

    async update(organizationId: string | Schema.Types.ObjectId, input: OrganizationUpdateInput): Promise<IOrganization | null> {
        const organizationIdObj = toObjectId(organizationId)
        await this.ensureOrganizationAdmin(organizationIdObj)

        try {
            // biome-ignore lint/suspicious/noExplicitAny: updateData needs to support MongoDB update operators dynamically
            const updateData: any = { ...input }
            if (updateData.description === null) {
                updateData.$unset = { description: 1 }
                delete updateData.description
            }
            if (typeof updateData.name === "string") {
                updateData.slug = slugify(updateData.name)
            }

            const updated = await Organization.findByIdAndUpdate(organizationIdObj, updateData, {
                new: true,
                runValidators: true
            })

            if (!updated) {
                throw new OrganizationNotFoundError(organizationIdObj.toString())
            }

            return updated
        } catch (error) {
            if (error instanceof BusinessException) throw error

            throw createBusinessException({
                code: "ORGANIZATION_UPDATE_ERROR",
                message: "Failed to update organization",
                details: { error: error instanceof Error ? error.message : "Unknown error" },
                statusCode: 500
            })
        }
    }

    /**
     * Deletes an organization that has nothing left in it.
     *
     * Deliberately not a cascade: an organization holds every project of a tenant, and wiping all of
     * them behind a single click is not something a confirmation dialog can make safe. The projects
     * have to be deleted first, one by one, where their own danger zone says what is being lost.
     */
    async delete(organizationId: string | Schema.Types.ObjectId): Promise<DeleteResult> {
        const organizationIdObj = toObjectId(organizationId)
        const role = await this.getRoleInOrganization(organizationIdObj)
        if (role !== RoleInOrganization.OWNER) {
            throw createBusinessException({
                code: "ORGANIZATION_OWNER_REQUIRED",
                message: "Only an owner can delete the organization",
                statusCode: 403
            })
        }

        const projects = await Project.countDocuments({ organizationId: organizationIdObj })
        if (projects > 0) {
            throw createBusinessException({
                code: "ORGANIZATION_NOT_EMPTY",
                message: "The organization still contains projects: delete them first",
                details: { projects },
                statusCode: 409
            })
        }

        return runInTransaction(async session => {
            await UserOrganization.deleteMany({ organizationId: organizationIdObj }, { session })
            return Organization.deleteOne({ _id: organizationIdObj }, { session })
        })
    }
}

export default OrganizationService
