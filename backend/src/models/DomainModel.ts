import mongoose, { Document, ObjectId, Schema } from "mongoose"
import { CONTEXT_MAX_LENGTH } from "./ProjectModel"

export const DOMAIN_NAME_MAX_LENGTH = 100
/** As the descriptions the MCP tools accept */
export const DOMAIN_DESCRIPTION_MAX_LENGTH = 2000

/**
 * A functional domain of a project: a named group of microfrontends and services. Membership lives
 * on the members (their optional `domainId`), so a microfrontend or a service is in one domain at most.
 */
export interface IDomain extends Document<ObjectId> {
    projectId: Schema.Types.ObjectId
    slug: string
    name: string
    description?: string
    /** Markdown for AI agents about this domain only; the project context covers what all domains share. */
    context?: string
    createdAt: Date
    updatedAt: Date
}

const domainSchema = new Schema<IDomain>(
    {
        projectId: {
            type: Schema.Types.ObjectId,
            ref: "Project",
            required: true
        },
        slug: {
            type: String,
            required: true,
            trim: true,
            lowercase: true
        },
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: DOMAIN_NAME_MAX_LENGTH
        },
        description: {
            type: String,
            trim: true,
            maxlength: DOMAIN_DESCRIPTION_MAX_LENGTH
        },
        context: {
            type: String,
            trim: true,
            maxlength: CONTEXT_MAX_LENGTH
        }
    },
    {
        timestamps: true
    }
)

domainSchema.index({ slug: 1, projectId: 1 }, { unique: true })

const Domain = mongoose.model<IDomain>("Domain", domainSchema)
export default Domain
