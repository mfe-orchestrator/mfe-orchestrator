import mongoose, { Document, ObjectId, Schema } from "mongoose"

export interface IEnvironment extends Document<ObjectId> {
    name: string
    description: string
    slug: string
    projectId: Schema.Types.ObjectId
    color: string
    isProduction: boolean
    url?: string
    order: number
    domains?: string[]
    /** The Kubernetes namespace GitOps commits the environment to; its slug in lowercase when unset */
    namespace?: string
    /** What it is exposed under on the domain of the project, e.g. `dev`; unset, the domain itself in production, the slug otherwise */
    subdomain?: string
}

const environmentSchema = new Schema<IEnvironment>(
    {
        name: {
            type: String,
            required: true
        },
        description: {
            type: String
        },
        slug: {
            type: String,
            required: true
        },
        color: {
            type: String,
            required: true
        },
        isProduction: {
            type: Boolean,
            default: false
        },
        domains: {
            type: [String],
            required: false
        },
        namespace: {
            type: String,
            trim: true
        },
        subdomain: {
            type: String,
            trim: true,
            lowercase: true
        },
        projectId: {
            type: Schema.Types.ObjectId,
            ref: "Project",
            required: true,
            index: true
        },
        order: {
            type: Number,
            required: true
        }
    },
    {
        timestamps: true
    }
)

// Create a compound index to ensure the combination of slug and projectId is unique
environmentSchema.index({ slug: 1, projectId: 1 }, { unique: true })

const Environment = mongoose.model<IEnvironment>("Environment", environmentSchema)
export default Environment
