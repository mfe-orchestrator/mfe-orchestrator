import mongoose, { Document, ObjectId, Schema } from "mongoose"
import { MicrofrontendCompiler, MicrofrontendFramework, MicrofrontendStackSource } from "../types/MicrofrontendStack"

export enum MicrofrontendType {
    HOST = "HOST",
    REMOTE = "REMOTE"
}

/** Framework and bundler of a microfrontend, and where that knowledge came from */
export interface IMicrofrontendStack {
    framework?: MicrofrontendFramework
    compiler?: MicrofrontendCompiler
    source: MicrofrontendStackSource
    detectedAt?: Date
}
export interface ICodeRepositoryMicrofrontend {
    enabled: boolean
    name: string
    codeRepositoryId: ObjectId
    repositoryId: string
    repositoryData: Record<string, unknown>
    cloneUrlHttps?: string
    cloneUrlSsh?: string
    gitlab?: {
        groupId?: number
        path?: string
    }
}

export interface ICanaryMicrofrontend {
    enabled: boolean
    percentage: number
    type: CanaryType
    deploymentType: CanaryDeploymentType
    url?: string
    version?: string
}

export interface IHostMicrofrontend {
    type: HostedOn
    url?: string
    storageId?: ObjectId
    entryPoint?: string
}

export interface IPosition {
    x?: number
    y?: number
    width?: number
    height?: number
}
export interface IMicrofrontend extends Document<ObjectId> {
    type: MicrofrontendType
    template: string
    stack?: IMicrofrontendStack
    slug: string
    name: string
    version: string
    continuousDeployment?: boolean
    path?: string
    projectId: Schema.Types.ObjectId
    canary?: ICanaryMicrofrontend
    host: IHostMicrofrontend
    codeRepository?: ICodeRepositoryMicrofrontend
    description?: string
    createdAt: Date
    updatedAt: Date

    parentIds?: ObjectId[]
    position?: IPosition
}

export enum HostedOn {
    MFE_ORCHESTRATOR_HUB = "MFE_ORCHESTRATOR_HUB",
    CUSTOM_URL = "CUSTOM_URL",
    CUSTOM_SOURCE = "CUSTOM_SOURCE"
}

/**
 * How the canary decides who gets the new version.
 *
 * The three are not variations of one mechanism: RANDOM and ON_SESSION split traffic by percentage
 * and differ only in whether the draw sticks, while ON_USER ignores the percentage entirely and
 * serves the canary to an explicit list of users.
 */
export enum CanaryType {
    /** A fresh draw on every request: the same browser flips between versions on every reload. */
    RANDOM = "RANDOM",
    /** Sticky per browser, on the id the SDK keeps in localStorage, so it survives a restart. */
    ON_SESSION = "ON_SESSION",
    /** No draw at all: only the users enrolled on the deployment get the canary. */
    ON_USER = "ON_USER"
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
        enum: [CanaryType.RANDOM, CanaryType.ON_SESSION, CanaryType.ON_USER],
        default: CanaryType.ON_SESSION,
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
    cloneUrlHttps: {
        type: String,
        required: false,
        trim: true
    },
    cloneUrlSsh: {
        type: String,
        required: false,
        trim: true
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

const microfrontendStackSchema = new Schema<IMicrofrontendStack>(
    {
        framework: {
            type: String,
            enum: Object.values(MicrofrontendFramework),
            required: false
        },
        compiler: {
            type: String,
            enum: Object.values(MicrofrontendCompiler),
            required: false
        },
        source: {
            type: String,
            enum: Object.values(MicrofrontendStackSource),
            required: true
        },
        detectedAt: {
            type: Date,
            required: false
        }
    },
    { _id: false }
)

const microfrontendPositionSchema = new Schema<IPosition>({
    x: {
        type: Number,
        required: false
    },
    y: {
        type: Number,
        required: false
    },
    width: {
        type: Number,
        required: false
    },
    height: {
        type: Number,
        required: false
    }
})

const microfrontendSchema: Schema = new Schema<IMicrofrontend>(
    {
        slug: {
            type: String,
            required: true,
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
        stack: {
            type: microfrontendStackSchema,
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
        },
        parentIds: {
            type: [Schema.Types.ObjectId],
            ref: "Microfrontend",
            required: false
        },
        path: {
            type: String,
            required: false
        },
        position: {
            type: microfrontendPositionSchema,
            required: false
        }
    },
    {
        timestamps: true
    }
)

microfrontendSchema.index({ slug: 1, projectId: 1 }, { unique: true })

const Microfrontend = mongoose.model<IMicrofrontend>("Microfrontend", microfrontendSchema)
export default Microfrontend
