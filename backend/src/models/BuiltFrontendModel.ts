import mongoose, { Document, Schema, ObjectId } from "mongoose"


export interface IBuiltFrontend extends Document<ObjectId> {
    microfrontendId: ObjectId
    version: string
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
    },
    {
        timestamps: true
    }
)

// Index for faster lookups by project and status
builtFrontendSchema.index({ microfrontendId: 1, version: 1 })

const BuiltFrontend = mongoose.model<IBuiltFrontend>("BuiltFrontend", builtFrontendSchema)
export default BuiltFrontend
