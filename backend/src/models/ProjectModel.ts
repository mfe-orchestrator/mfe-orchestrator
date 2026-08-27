import mongoose, { Document, ObjectId, Schema } from "mongoose"

export interface IProject extends Document<ObjectId> {
    /** The organization owning the project. A project belongs to exactly one, and never changes hands. */
    organizationId: Schema.Types.ObjectId
    name: string
    slug: string
    description?: string
    isActive: boolean
    createdAt: Date
    updatedAt: Date
}

const projectSchema = new Schema<IProject>(
    {
        organizationId: {
            type: Schema.Types.ObjectId,
            ref: "Organization",
            required: true,
            index: true
        },
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
        },
        isActive: {
            type: Boolean,
            default: true
        }
    },
    {
        timestamps: true
    }
)

const Project = mongoose.model<IProject>("Project", projectSchema)
export default Project
