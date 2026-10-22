import mongoose, { Document, ObjectId, Schema } from "mongoose"

/** A version of a microfrontend: a bundle uploaded to the orchestrator, or for a FRONTEND an image the CI pushed and registered */
export interface IBuiltFrontend extends Document<ObjectId> {
    microfrontendId: ObjectId
    version: string
    /** FRONTEND only. Full reference, e.g. ghcr.io/acme/shell:1.2.0 */
    image?: string
    digest?: string
    commitSha?: string
    createdAt: Date
    updatedAt: Date
}

const builtFrontendSchema = new Schema<IBuiltFrontend>(
    {
        microfrontendId: {
            type: Schema.Types.ObjectId,
            ref: "Microfrontend",
            required: true,
            index: true
        },
        version: {
            type: String,
            required: true,
            trim: true,
            maxlength: 255
        },
        image: {
            type: String,
            required: false,
            trim: true
        },
        digest: {
            type: String,
            required: false,
            trim: true
        },
        commitSha: {
            type: String,
            required: false,
            trim: true
        }
    },
    {
        timestamps: true
    }
)

// Index for faster lookups by project and status
builtFrontendSchema.index({ microfrontendId: 1, version: 1 })
// A version of a FRONTEND is registered once, a CI rerun replacing it: uploads of a bundle carry no image and stay out of it
builtFrontendSchema.index({ microfrontendId: 1, version: 1 }, { name: "microfrontendId_1_version_1_image", unique: true, partialFilterExpression: { image: { $exists: true } } })

const BuiltFrontend = mongoose.model<IBuiltFrontend>("BuiltFrontend", builtFrontendSchema)
export default BuiltFrontend
