import mongoose, { Schema, Document, ObjectId } from "mongoose"

export interface IMicrofrontend extends Document<ObjectId> {
    slug: string
    name: string
    version: string
    canaryVersion?: string
    continuousDeployment?: boolean
    url: string
    projectId: ObjectId
    canary?: {
        enabled: boolean
        percentage: number
        type: CanaryType
        deploymentType: CanaryDeploymentType
        url?: string
        version?: string
    }
    host: {
        type: HostedOn
        url?: string
    }
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

const microfrontendHostTypeSchema = new Schema({
    type: {
        type: String,
        enum: [HostedOn.CUSTOM_URL, HostedOn.MFE_ORCHESTRATOR_HUB],
        default: HostedOn.CUSTOM_URL,
        required: true
    },
    url: {
        type: String,
        required: false
    }
})
const microfrontendCanaryTypeSchema = new Schema({
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
    canaryUrl: {
        type: String,
        required: false
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
        }
    },
    {
        timestamps: true
    }
)

const Microfrontend = mongoose.model<IMicrofrontend>("Microfrontend", microfrontendSchema)
export default Microfrontend
