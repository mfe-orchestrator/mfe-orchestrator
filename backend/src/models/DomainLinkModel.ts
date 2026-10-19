import mongoose, { Document, ObjectId, Schema } from "mongoose"

export const DOMAIN_LINK_LABEL_MAX_LENGTH = 100

/**
 * A relation between two functional domains of a project, drawn by hand: "Payments → Checkout".
 * It states how the team sees the domains, apart from the links between their members, which the
 * galaxy view derives on its own.
 */
export interface IDomainLink extends Document<ObjectId> {
    projectId: Schema.Types.ObjectId
    sourceDomainId: Schema.Types.ObjectId
    targetDomainId: Schema.Types.ObjectId
    /** What the relation is, e.g. "uses" or "publishes events to" */
    label?: string
    createdAt: Date
    updatedAt: Date
}

const domainLinkSchema = new Schema<IDomainLink>(
    {
        projectId: {
            type: Schema.Types.ObjectId,
            ref: "Project",
            required: true
        },
        sourceDomainId: {
            type: Schema.Types.ObjectId,
            ref: "Domain",
            required: true
        },
        targetDomainId: {
            type: Schema.Types.ObjectId,
            ref: "Domain",
            required: true
        },
        label: {
            type: String,
            trim: true,
            maxlength: DOMAIN_LINK_LABEL_MAX_LENGTH
        }
    },
    {
        timestamps: true
    }
)

domainLinkSchema.index({ projectId: 1, sourceDomainId: 1, targetDomainId: 1 }, { unique: true })

const DomainLink = mongoose.model<IDomainLink>("DomainLink", domainLinkSchema)
export default DomainLink
