import mongoose, { Document, Schema, ObjectId } from "mongoose"

export enum CodeRepositoryProvider {
    GITHUB = "GITHUB",
    GITLAB = "GITLAB",
    AZURE_DEV_OPS = "AZURE_DEV_OPS"
}

export enum CodeRepositoryType {
    PERSONAL = "PERSONAL",
    ORGANIZATION = "ORGANIZATION"
}

export interface IGithubData {
    organizationId?: string,
    userName?: string,
    type: CodeRepositoryType
}

export interface IAzureData {
    projectId: string,
    organization: string
}

export interface IGitlabData {
    url: string,
    project: string
}

export interface ICodeRepository extends Document<ObjectId> {
    name: string
    provider: CodeRepositoryProvider
    accessToken: string
    refreshToken?: string
    githubData?: IGithubData,
    azureData?: IAzureData,
    gitlabData?: IGitlabData,
    default?: boolean,
    isActive?: boolean
    projectId: ObjectId
    createdAt: Date
    updatedAt: Date
}

const githubDataSchema = new Schema<IGithubData>(
    {
        organizationId: {
            type: String,
            required: false
        },
        userName: {
            type: String,
            required: false
        },
        type: {
            type: String,
            enum: Object.values(CodeRepositoryType),
            required: true,
            default: CodeRepositoryType.PERSONAL
        }
    }
)

const azureDataSchema = new Schema<IAzureData>(
    {
        projectId: {
            type: String,
            required: true
        },
        organization: {
            type: String,
            required: false,
        }
    }
)

const gitlabDataSchema = new Schema<IGitlabData>(
    {
        url: {
            type: String,
            required: true,
            trim: true
        },
        project: {
            type: String,
            required: false,
            trim: true
        }
    }
)

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
            type: githubDataSchema,
            required: false
        },
        azureData: {
            type: azureDataSchema,
            required: false
        },
        gitlabData: {
            required: false,
            type: gitlabDataSchema
        },
        isActive: {
            type: Boolean,
            default: true,
            required: false
        },
        default: {
            type: Boolean,
            default: false,
            required: false
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


const CodeRepository = mongoose.model<ICodeRepository>("CodeRepository", codeRepositorySchema)
export default CodeRepository
