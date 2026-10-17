import mongoose, { Document, ObjectId, Schema } from "mongoose"
import { ServiceDefaults } from "../types/ServiceStack"

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
    /**
     * File of the build output a microfrontend created from the template is served by, relative
     * to the uploaded folder (`assets/remoteEntry.js`, `index.js`, `parcel.js`)
     */
    entryPoint?: string
    /** Service templates only, shipped with the backend (not stored): what a service created from it starts with */
    serviceDefaults?: ServiceDefaults
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
        },
        entryPoint: {
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
