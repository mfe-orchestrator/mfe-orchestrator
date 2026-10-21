import mongoose, { Document, ObjectId, Schema } from "mongoose"
import { MicrofrontendCompiler, MicrofrontendFramework, MicrofrontendStackSource } from "../types/MicrofrontendStack"
import { ServicePaths } from "../types/ServiceStack"
import { exposurePath, IServiceEnvVariable, IServiceUrl, optionalPath, serviceEnvVariableSchema, serviceUrlSchema } from "./ContainerFields"
import { CONTEXT_MAX_LENGTH } from "./ProjectModel"

export enum MicrofrontendType {
    HOST = "HOST",
    REMOTE = "REMOTE"
}

/**
 * How it is built and served, independent from HOST/REMOTE: a host can itself be a remote of other hosts.
 *
 * A MICROFRONTEND is a static bundle the CI uploads and the orchestrator serves. A FRONTEND is an app
 * built into an image and served by its own container, exactly like a backend service: the orchestrator
 * neither stores its files nor deploys it, the CI registers its versions and the CD reports its deploys.
 * A FRONTEND is the top of a tree: it loads remotes, nothing loads it, so it never has parents.
 */
export enum MicrofrontendKind {
    MICROFRONTEND = "MICROFRONTEND",
    FRONTEND = "FRONTEND"
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
/**
 * The container fields of a FRONTEND, named as on a service. All optional with no default, so a
 * MICROFRONTEND document carries none of them; MicrofrontendService fills the service defaults in
 * when a FRONTEND is created.
 */
export interface IFrontendContainer extends Partial<ServicePaths> {
    image?: {
        /** Without tag, e.g. ghcr.io/acme/shell */
        repository?: string
    }
    port?: number
    /** The path it is exposed at on the host of every environment, as for a service */
    exposurePath?: string | null
    /** One per environment it is exposed in: what the serve API hands out as its URL there */
    urls?: IServiceUrl[]
    env?: IServiceEnvVariable[]
    /** Config maps of the project the container receives as environment variables, as for a service */
    configMapIds?: Schema.Types.ObjectId[]
    /** Secrets of the project the container receives as environment variables, as for a service */
    secretIds?: Schema.Types.ObjectId[]
}

export interface IMicrofrontend extends Document<ObjectId>, IFrontendContainer {
    type: MicrofrontendType
    kind: MicrofrontendKind
    template: string
    stack?: IMicrofrontendStack
    slug: string
    name: string
    /** Unset on a FRONTEND until its CI registers a first version */
    version: string
    continuousDeployment?: boolean
    path?: string
    projectId: Schema.Types.ObjectId
    /** The functional domain it belongs to, if any */
    domainId?: Schema.Types.ObjectId | null
    canary?: ICanaryMicrofrontend
    host: IHostMicrofrontend
    codeRepository?: ICodeRepositoryMicrofrontend
    description?: string
    /** Markdown for AI agents about this microfrontend only; the project context covers what they share. */
    context?: string
    createdAt: Date
    updatedAt: Date

    parentIds?: ObjectId[]
    /** Backend services this microfrontend calls, linked by hand from the console */
    serviceIds?: ObjectId[]
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

/** Shared with the backend services, which link their repository exactly the same way */
export const microfrontendCodeRepositorySchema = new Schema<ICodeRepositoryMicrofrontend>({
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
        context: {
            type: String,
            trim: true,
            maxlength: CONTEXT_MAX_LENGTH
        },
        version: {
            type: String,
            // A FRONTEND gets its first one from the first version its CI registers, as a service
            required: function (this: IMicrofrontend) {
                return this.kind !== MicrofrontendKind.FRONTEND
            }
        },
        type: {
            type: String,
            enum: [MicrofrontendType.HOST, MicrofrontendType.REMOTE],
            default: MicrofrontendType.HOST,
            required: true
        },
        kind: {
            type: String,
            enum: Object.values(MicrofrontendKind),
            default: MicrofrontendKind.MICROFRONTEND,
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
        domainId: {
            type: Schema.Types.ObjectId,
            ref: "Domain",
            required: false
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
        serviceIds: {
            type: [Schema.Types.ObjectId],
            ref: "Service",
            required: false
        },
        path: {
            type: String,
            required: false
        },
        position: {
            type: microfrontendPositionSchema,
            required: false
        },
        // The arrays default to undefined, not to [], so that a MICROFRONTEND document stays without them
        image: {
            repository: {
                type: String,
                required: false,
                trim: true
            }
        },
        port: {
            type: Number,
            required: false
        },
        livenessPath: optionalPath,
        readinessPath: optionalPath,
        docsPath: optionalPath,
        openApiPath: optionalPath,
        exposurePath,
        urls: {
            type: [serviceUrlSchema],
            default: undefined
        },
        env: {
            type: [serviceEnvVariableSchema],
            default: undefined
        },
        configMapIds: {
            type: [{ type: Schema.Types.ObjectId, ref: "ConfigMap" }],
            default: undefined
        },
        secretIds: {
            type: [{ type: Schema.Types.ObjectId, ref: "Secret" }],
            default: undefined
        }
    },
    {
        timestamps: true
    }
)

microfrontendSchema.index({ slug: 1, projectId: 1 }, { unique: true })

const Microfrontend = mongoose.model<IMicrofrontend>("Microfrontend", microfrontendSchema)
export default Microfrontend
