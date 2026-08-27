import mongoose, { Document, ObjectId, Schema } from "mongoose"

/**
 * The tenant every project belongs to.
 *
 * A project sits in exactly one organization, and an organization is the boundary the membership
 * roles are written against: it is what makes "who may see this project" answerable without walking
 * the whole project list.
 */
export interface IOrganization extends Document<ObjectId> {
    name: string
    slug: string
    description?: string
    createdAt: Date
    updatedAt: Date
}

const organizationSchema = new Schema<IOrganization>(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 255
        },
        slug: {
            type: String,
            required: true,
            trim: true,
            maxlength: 255
        },
        description: {
            type: String,
            trim: true
        }
    },
    {
        timestamps: true
    }
)

const Organization = mongoose.model<IOrganization>("Organization", organizationSchema)
export default Organization
