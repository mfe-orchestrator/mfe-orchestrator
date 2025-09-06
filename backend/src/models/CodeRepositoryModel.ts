import mongoose, { Document, Schema, ObjectId } from "mongoose"
import { GithubUser, GithubOrganization } from "../client/GithubClient"

export enum CodeRepositoryProvider {
    GITHUB = "GITHUB",
    GITLAB = "GITLAB",
    AZURE_DEV_OPS = "AZURE_DEV_OPS"
}

export interface ICodeRepository extends Document<ObjectId> {
    name: string
    provider: CodeRepositoryProvider
    accessToken: string
    refreshToken?: string
    githubData?: {
        user: GithubUser,
        organizations: GithubOrganization[]
    },
    isActive: boolean
    projectId: ObjectId
    createdAt: Date
    updatedAt: Date
}

const codeRepositorySchema = new Schema<ICodeRepository>(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 255
        },
        provider: {
            type: String,
            required: true,
            enum: Object.values(CodeRepositoryProvider),
            default: CodeRepositoryProvider.GITHUB
        },
        accessToken: {
            type: String,
            required: true,
            trim: true
        },
        refreshToken: {
            type: String,
            trim: true
        },
        githubData: {
            type: Object,
            required: true
        },
        isActive: {
            type: Boolean,
            default: true
        },
        projectId: {
            type: Schema.Types.ObjectId,
            ref: "Project",
            required: true,
            index: true
        }
    },
    {
        timestamps: true
    }
)

// Add index on provider and name for faster lookups
codeRepositorySchema.index({ provider: 1, name: 1 }, { unique: true })

const CodeRepository = mongoose.model<ICodeRepository>("CodeRepository", codeRepositorySchema)
export default CodeRepository
