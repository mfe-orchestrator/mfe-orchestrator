import mongoose, { Document, ObjectId, Schema } from "mongoose"
import { MicrofrontendStackSource } from "../types/MicrofrontendStack"
import { SERVICE_HTTP_PATH, ServicePaths, ServiceRuntime } from "../types/ServiceStack"
import { ICodeRepositoryMicrofrontend, microfrontendCodeRepositorySchema } from "./MicrofrontendModel"
import { CONTEXT_MAX_LENGTH } from "./ProjectModel"

/** Runtime and framework of a backend service, and where that knowledge came from */
export interface IServiceStack {
    runtime?: ServiceRuntime
    framework?: string
    source: MicrofrontendStackSource
    detectedAt?: Date
}

/** A variable the service image reads from its environment */
export interface IServiceEnvVariable {
    name: string
    required: boolean
    secret: boolean
    description?: string
}

export interface IService extends Document<ObjectId>, ServicePaths {
    projectId: Schema.Types.ObjectId
    /** The functional domain it belongs to, if any */
    domainId?: Schema.Types.ObjectId | null
    slug: string
    name: string
    description?: string
    /** Markdown for AI agents about this service only; the project context covers what they share. */
    context?: string
    template?: string
    stack?: IServiceStack
    /** The latest version the CI registered */
    version?: string
    codeRepository?: ICodeRepositoryMicrofrontend
    image?: {
        /** Without tag, e.g. ghcr.io/acme/orders-api */
        repository?: string
    }
    port: number
    env: IServiceEnvVariable[]
    createdAt: Date
    updatedAt: Date
}

const serviceStackSchema = new Schema<IServiceStack>(
    {
        runtime: {
            type: String,
            enum: Object.values(ServiceRuntime),
            required: false
        },
        framework: {
            type: String,
            required: false,
            trim: true
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

const serviceEnvVariableSchema = new Schema<IServiceEnvVariable>(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },
        required: {
            type: Boolean,
            default: false
        },
        secret: {
            type: Boolean,
            default: false
        },
        description: {
            type: String,
            required: false,
            trim: true
        }
    },
    { _id: false }
)

const httpPathValidator = {
    validator: (value?: string | null) => value == null || SERVICE_HTTP_PATH.test(value),
    message: (props: { path: string; value: unknown }) => `${props.path} "${props.value}" must start with "/", have at most 256 characters and no whitespace`
}

/** A probe path: always set, the template or the platform default when not given */
const probePath = (defaultValue: string) => ({ type: String, default: defaultValue, trim: true, validate: httpPathValidator })

/** An optional path: blank means the service has none, so it is stored as null rather than as "" */
const optionalPath = {
    type: String,
    required: false,
    set: (value?: string | null) => value?.trim() || null,
    validate: httpPathValidator
}

const serviceSchema = new Schema<IService>(
    {
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
        template: {
            type: String,
            required: false
        },
        stack: {
            type: serviceStackSchema,
            required: false
        },
        version: {
            type: String,
            required: false
        },
        codeRepository: {
            type: microfrontendCodeRepositorySchema,
            required: false
        },
        image: {
            repository: {
                type: String,
                required: false,
                trim: true
            }
        },
        port: {
            type: Number,
            default: 8080
        },
        livenessPath: probePath("/health/live"),
        readinessPath: probePath("/health/ready"),
        docsPath: optionalPath,
        openApiPath: optionalPath,
        env: {
            type: [serviceEnvVariableSchema],
            default: []
        }
    },
    {
        timestamps: true
    }
)

serviceSchema.index({ slug: 1, projectId: 1 }, { unique: true })

const Service = mongoose.model<IService>("Service", serviceSchema)
export default Service
