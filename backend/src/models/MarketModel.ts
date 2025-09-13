import mongoose, { Document, Schema, ObjectId } from "mongoose"

export interface IMarket extends Document<ObjectId> {
    name: string
    description: string
    icon: string
    category: string
    pathGithub?: string
    pathGitlab?: string
    pathDevOps?: string
    createdAt: Date
    updatedAt: Date
}

const marketSchema = new Schema<IMarket>(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 255
        },
        description: {
            type: String,
            required: true,
            trim: true
        },
        icon: {
            type: String,
            required: true,
            trim: true
        },
        category: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100
        },
        pathGithub: {
            type: String,
            required: false,
            trim: true
        },
        pathGitlab: {
            type: String,
            required: false,
            trim: true
        },
        pathDevOps: {
            type: String,
            required: false,
            trim: true
        }
    },
    {
        timestamps: true
    }
)

const Market = mongoose.model<IMarket>("Market", marketSchema)
export default Market