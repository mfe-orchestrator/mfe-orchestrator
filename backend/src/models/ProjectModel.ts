import mongoose, { Document, ObjectId, Schema } from "mongoose"
import type { ICodeRepositoryMicrofrontend } from "./MicrofrontendModel"

/** Upper bound of a context, of a project, a domain, a microfrontend or a service: it ends up in the prompt of every agent reading it. */
export const CONTEXT_MAX_LENGTH = 20_000

/** Config maps and secrets committed to a repository as Kubernetes manifests, every time one is saved */
export interface IProjectGitOps {
    enabled: boolean
    /** Linked like the repository of a microfrontend, through one of the connections of the project */
    codeRepository?: ICodeRepositoryMicrofrontend
}

export interface IProject extends Document<ObjectId> {
    /** The organization owning the project. A project belongs to exactly one, and never changes hands. */
    organizationId: Schema.Types.ObjectId
    name: string
    slug: string
    description?: string
    /** Markdown written by the team for AI agents (MCP clients, the console assistant): conventions, domain, rules. */
    context?: string
    isActive: boolean
    gitOps?: IProjectGitOps
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
        context: {
            type: String,
            trim: true,
            maxlength: CONTEXT_MAX_LENGTH
        },
        isActive: {
            type: Boolean,
            default: true
        },
        gitOps: {
            enabled: { type: Boolean, default: false },
            // Written by GitOpsService only, from what the provider answered: never from the request body
            codeRepository: { type: Schema.Types.Mixed }
        }
    },
    {
        timestamps: true
    }
)

const Project = mongoose.model<IProject>("Project", projectSchema)
export default Project
