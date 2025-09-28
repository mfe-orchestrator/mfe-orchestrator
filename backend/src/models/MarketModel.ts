import mongoose, { Document, Schema, ObjectId } from "mongoose"

export interface IMarket extends Document<ObjectId> {
    name: string
    slug: string
    description: string
    comingSoon?: boolean
    icon: string
    category: string
    framework: string
    tags: string[]
    version?: string
    author?: string
    license?: string
    repo?: string
    zipUrl?: string
    type?: string
    compiler?: string
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
        slug: {
            type: String,
            required: true,
            trim: true,
            unique: true,
            maxlength: 255
        },
        comingSoon: {
            type: Boolean,
            required: false,
            default: false
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
        framework: {
            type: String,
            required: true,
            trim: true
        },
        tags: {
            type: [String],
            required: true,
            default: []
        },
        version: {
            type: String,
            required: false,
            trim: true
        },
        author: {
            type: String,
            required: false,
            trim: true
        },
        license: {
            type: String,
            required: false,
            trim: true
        },
        repo: {
            type: String,
            required: false,
            trim: true
        },
        type: {
            type: String,
            required: false,
            trim: true
        },
        compiler: {
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