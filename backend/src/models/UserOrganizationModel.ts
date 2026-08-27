import mongoose, { Document, ObjectId, Schema } from "mongoose"

/**
 * What a user may do inside an organization.
 *
 * OWNER and ADMIN differ only in that the last OWNER cannot be removed or demoted: both administer
 * the organization and reach every project in it. A MEMBER reaches only the projects they were
 * invited to, which is the whole point of keeping this role separate from the project role.
 */
export enum RoleInOrganization {
    OWNER = "OWNER",
    ADMIN = "ADMIN",
    MEMBER = "MEMBER"
}

/** The two administering roles, in one place: every visibility check reads this. */
export const ORGANIZATION_ADMIN_ROLES = [RoleInOrganization.OWNER, RoleInOrganization.ADMIN]

export interface IUserOrganization extends Document<ObjectId> {
    userId: Schema.Types.ObjectId
    organizationId: Schema.Types.ObjectId
    role: RoleInOrganization
    invitationToken?: string
    invitationTokenExpiresAt?: Date
    createdAt: Date
    updatedAt: Date
}

const userOrganizationSchema = new Schema<IUserOrganization>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },
        organizationId: {
            type: Schema.Types.ObjectId,
            ref: "Organization",
            required: true,
            index: true
        },
        role: {
            type: String,
            enum: Object.values(RoleInOrganization),
            default: RoleInOrganization.MEMBER,
            required: true
        },
        // Set while the invitation is waiting for an answer, and cleared when it is accepted: a row
        // still carrying a token is not a membership, exactly as on UserProject.
        invitationToken: {
            type: String,
            required: false
        },
        invitationTokenExpiresAt: {
            type: Date,
            required: false
        }
    },
    {
        timestamps: true
    }
)

userOrganizationSchema.index({ userId: 1, organizationId: 1 }, { unique: true })

const UserOrganization = mongoose.model<IUserOrganization>("UserOrganization", userOrganizationSchema)
export default UserOrganization
