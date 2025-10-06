import mongoose, { Schema, Document, ObjectId } from "mongoose"

export enum MicrofrontendType {
    HOST = "HOST",
    REMOTE = "REMOTE"
}
export interface ICodeRepositoryMicrofrontend{
    enabled: boolean
    name: string
    codeRepositoryId: ObjectId
    repositoryId: string
    repositoryData: any,
    gitlab?: {
        groupId?: number,
        path?: string,
    }
}

export interface ICanaryMicrofrontend{
    enabled: boolean
    percentage: number
    type: CanaryType
    deploymentType: CanaryDeploymentType
    url?: string
    version?: string
}

export interface IHostMicrofrontend{
    type: HostedOn
    url?: string
    storageId?: ObjectId
    entryPoint?: string
}
export interface IMicrofrontend extends Document<ObjectId> {
    type: MicrofrontendType
    template: string
    slug: string
    name: string
    version: string
    continuousDeployment?: boolean
    projectId: ObjectId
    canary?: ICanaryMicrofrontend
    host: IHostMicrofrontend
    codeRepository?: ICodeRepositoryMicrofrontend
    description?: string
    createdAt: Date
    updatedAt: Date
}

export enum HostedOn {
    MFE_ORCHESTRATOR_HUB = "MFE_ORCHESTRATOR_HUB",
    CUSTOM_URL = "CUSTOM_URL",
    CUSTOM_SOURCE = "CUSTOM_SOURCE"
}

export enum CanaryType {
    ON_SESSIONS = "ON_SESSIONS",
    ON_USER = "ON_USER",
    COOKIE_BASED = "COOKIE_BASED"
}

export enum CanaryDeploymentType {
    BASED_ON_VERSION = "BASED_ON_VERSION",
    BASED_ON_URL = "BASED_ON_URL"
}

const microfrontendHostTypeSchema = new Schema<IHostMicrofrontend>({
    type: {
        type: String,
        enum: [HostedOn.CUSTOM_URL, HostedOn.MFE_ORCHESTRATOR_HUB, HostedOn.CUSTOM_SOURCE],
        default: HostedOn.CUSTOM_URL,
        required: true
    },
    url: {
        type: String,
        required: false
    },
    storageId: {
        type: Schema.Types.ObjectId,
        ref: "Storage",
        required: false
    },
    entryPoint: {
        type: String,
        required: false
    }
})

const microfrontendCanaryTypeSchema = new Schema<ICanaryMicrofrontend>({
    enabled: {
        type: Boolean,
        default: false
    },
    percentage: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
    },
    type: {
        type: String,
        enum: [CanaryType.ON_SESSIONS, CanaryType.ON_USER, CanaryType.COOKIE_BASED],
        default: CanaryType.ON_SESSIONS,
        required: true
    },
    deploymentType: {
        type: String,
        enum: [CanaryDeploymentType.BASED_ON_VERSION, CanaryDeploymentType.BASED_ON_URL],
        default: CanaryDeploymentType.BASED_ON_VERSION,
        required: true
    },
    url: {
        type: String,
        required: false
    },
    version: {
        type: String,
        required: false
    }
})

const microfrontendCodeRepositorySchema = new Schema<ICodeRepositoryMicrofrontend>({
    enabled: {
        type: Boolean,
        default: false
    },
    codeRepositoryId: {
        type: Schema.Types.ObjectId,
        ref: "Repository",
        required: false
    },
    repositoryId: {
        type: String,
        required: false
    },
    name: {
        type: String,
        required: false
    },
    repositoryData: {
        type: Object,
        required: false
    },
    gitlab: {
        groupId: {
            type: Number,
            required: false
        },
        path: {
            type: String,
            required: false
        }
    }
})

const microfrontendSchema: Schema = new Schema<IMicrofrontend>(
    {
        slug: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true
        },
        name: {
            type: String,
            required: true,
            trim: true
        },
        description: {
            type: String,
            trim: true
        },
        version: {
            type: String,
            required: true
        },
        type: {
            type: String,
            enum: [MicrofrontendType.HOST, MicrofrontendType.REMOTE],
            default: MicrofrontendType.HOST,
            required: true
        },
        template: {
            type: String,
            required: false
        },
        canary: {
            type: microfrontendCanaryTypeSchema,
            required: false
        },
        projectId: {
            type: Schema.Types.ObjectId,
            ref: "Project",
            required: true
        },
        host: {
            type: microfrontendHostTypeSchema,
            required: true
        },
        codeRepository: {
            type: microfrontendCodeRepositorySchema,
            required: false
        }
    },
    {
        timestamps: true
    }
)

const Microfrontend = mongoose.model<IMicrofrontend>("Microfrontend", microfrontendSchema)
export default Microfrontend
