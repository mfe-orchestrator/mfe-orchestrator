import mongoose, { Document, ObjectId, Schema } from "mongoose"
import { encryptedFields } from "../utils/encryptedFieldsPlugin"
import { SECRET_PLACEHOLDER } from "../utils/secretCrypto"

/** The two fields that are a credential for the provider, and not metadata about the connection. */
export const CODE_REPOSITORY_SECRET_PATHS = ["accessToken", "refreshToken"]

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
    organizationId?: string
    userName?: string
    type: CodeRepositoryType
}

export interface IAzureData {
    projectId: string
    projectName: string
    organization: string
}

export interface IGitlabData {
    url: string
    groupId: number
    groupPath: string
}

export interface ICodeRepository extends Document<ObjectId> {
    name: string
    provider: CodeRepositoryProvider
    accessToken: string
    refreshToken?: string
    githubData?: IGithubData
    azureData?: IAzureData
    gitlabData?: IGitlabData
    default?: boolean
    isActive?: boolean
    projectId: ObjectId
    createdAt: Date
    updatedAt: Date
    toFrontendObject: () => Record<string, unknown>
}

const githubDataSchema = new Schema<IGithubData>({
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
})

const azureDataSchema = new Schema<IAzureData>({
    projectId: {
        type: String,
        required: true
    },
    projectName: {
        type: String,
        required: true
    },
    organization: {
        type: String,
        required: false
    }
})

const gitlabDataSchema = new Schema<IGitlabData>({
    url: {
        type: String,
        required: true,
        trim: true
    },
    groupId: {
        type: Number,
        required: true,
        trim: true
    },
    groupPath: {
        type: String,
        required: true,
        trim: true
    }
})

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

codeRepositorySchema.plugin(encryptedFields, { model: "CodeRepository", paths: CODE_REPOSITORY_SECRET_PATHS })

/**
 * The connection as the console may see it. The token becomes the placeholder instead of disappearing
 * because the Azure and GitLab edit screens submit the whole form back: a field that came in as the
 * placeholder is understood as "the token has not been retyped", and the stored one is kept.
 */
codeRepositorySchema.methods.toFrontendObject = function (): Record<string, unknown> {
    const object = this.toObject()
    delete object.__v

    for (const path of CODE_REPOSITORY_SECRET_PATHS) {
        if (object[path]) {
            object[path] = SECRET_PLACEHOLDER
        }
    }

    return object
}

const CodeRepository = mongoose.model<ICodeRepository>("CodeRepository", codeRepositorySchema)
export default CodeRepository
