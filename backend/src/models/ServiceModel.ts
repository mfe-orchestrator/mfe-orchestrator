import mongoose, { Document, ObjectId, Schema } from "mongoose"
import { MicrofrontendStackSource } from "../types/MicrofrontendStack"
import { ServicePaths, ServiceRuntime } from "../types/ServiceStack"
import { CONTAINER_DEFAULTS, exposurePath, IServiceEnvVariable, IServiceUrl, optionalPath, probePath, serviceEnvVariableSchema, serviceUrlSchema } from "./ContainerFields"
import { ICodeRepositoryMicrofrontend, microfrontendCodeRepositorySchema } from "./MicrofrontendModel"
import { CONTEXT_MAX_LENGTH } from "./ProjectModel"

export type { IServiceEnvVariable, IServiceUrl }

/** Runtime and framework of a backend service, and where that knowledge came from */
export interface IServiceStack {
    runtime?: ServiceRuntime
    framework?: string
    source: MicrofrontendStackSource
    detectedAt?: Date
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
    /** The path it is exposed at on the host of every environment, e.g. /api/orders; null when it is not exposed */
    exposurePath?: string | null
    /** One per environment it is exposed in; an environment left out has no known address */
    urls: IServiceUrl[]
    env: IServiceEnvVariable[]
    /** Config maps of the project the service receives as environment variables; they live on their own and can be shared */
    configMapIds: Schema.Types.ObjectId[]
    /** Secrets of the project the service receives as environment variables, as for the config maps */
    secretIds: Schema.Types.ObjectId[]
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
            default: CONTAINER_DEFAULTS.port
        },
        livenessPath: probePath(CONTAINER_DEFAULTS.livenessPath),
        readinessPath: probePath(CONTAINER_DEFAULTS.readinessPath),
        docsPath: optionalPath,
        openApiPath: optionalPath,
        exposurePath,
        urls: {
            type: [serviceUrlSchema],
            default: []
        },
        env: {
            type: [serviceEnvVariableSchema],
            default: []
        },
        configMapIds: {
            type: [{ type: Schema.Types.ObjectId, ref: "ConfigMap" }],
            default: []
        },
        secretIds: {
            type: [{ type: Schema.Types.ObjectId, ref: "Secret" }],
            default: []
        }
    },
    {
        timestamps: true
    }
)

serviceSchema.index({ slug: 1, projectId: 1 }, { unique: true })

/**
 * A service the migration to maps has not reached yet still holds its old inline values, and Mongoose
 * serialises fields the schema does not know: without this, its secrets would go out through every API,
 * the MCP tools included, which read the document through toObject.
 */
const withoutInlineVariables = {
    transform: (_document: unknown, object: IService) => {
        const { configMap: _configMap, secrets: _secrets, ...rest } = object as IService & { configMap?: unknown; secrets?: unknown }
        return rest
    }
}
serviceSchema.set("toJSON", withoutInlineVariables)
serviceSchema.set("toObject", withoutInlineVariables)

const Service = mongoose.model<IService>("Service", serviceSchema)
export default Service
