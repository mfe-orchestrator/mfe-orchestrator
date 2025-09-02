import mongoose, { Schema, Document, ObjectId, Types } from "mongoose"

export interface IEnvironment extends Document<ObjectId> {
    name: string
    description: string
    slug: string
    projectId: Types.ObjectId
    color: string
    isProduction: boolean
    url?: string
    order: number
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
        projectId: {
            type: Schema.Types.ObjectId,
            ref: "Project",
            required: true,
            index: true
        },
        url:{
            type: String,
            required: false
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
