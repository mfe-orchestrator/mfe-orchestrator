import { Schema } from "mongoose"
import { isExposurePath } from "../types/Exposure"
import { isServiceUrl, SERVICE_HTTP_PATH } from "../types/ServiceStack"

/**
 * The fields of what runs as a container of its own: a backend service, or a frontend built into an
 * image. They live apart from both models because ServiceModel already imports MicrofrontendModel, so
 * the microfrontend schema could not import them from ServiceModel without a cycle.
 */

/** A variable the image reads from its environment */
export interface IServiceEnvVariable {
    name: string
    required: boolean
    secret: boolean
    description?: string
}

/** Where the container answers in one environment of the project: the base its probe, docs and OpenAPI paths hang off */
export interface IServiceUrl {
    environmentId: Schema.Types.ObjectId
    url: string
}

/** What a container gets when neither the caller nor a template says otherwise */
export const CONTAINER_DEFAULTS = { port: 8080, livenessPath: "/health/live", readinessPath: "/health/ready" }

export const serviceEnvVariableSchema = new Schema<IServiceEnvVariable>(
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

export const serviceUrlSchema = new Schema<IServiceUrl>(
    {
        environmentId: {
            type: Schema.Types.ObjectId,
            ref: "Environment",
            required: true
        },
        url: {
            type: String,
            required: true,
            trim: true,
            // ServiceService normalises it first; this keeps any other write path from storing an href the console would render
            validate: { validator: isServiceUrl, message: (props: { value: unknown }) => `"${String(props.value)}" is not a valid service URL` }
        }
    },
    { _id: false }
)

const httpPathValidator = {
    validator: (value?: string | null) => value == null || SERVICE_HTTP_PATH.test(value),
    message: (props: { path: string; value: unknown }) => `${props.path} "${props.value}" must start with "/", have at most 256 characters and no whitespace`
}

/** A probe path: always set, the template or the platform default when not given */
export const probePath = (defaultValue: string) => ({ type: String, default: defaultValue, trim: true, validate: httpPathValidator })

/** An optional path: blank means the container has none, so it is stored as null rather than as "" */
export const optionalPath = {
    type: String,
    required: false,
    set: (value?: string | null) => value?.trim() || null,
    validate: httpPathValidator
}

/** The path an application is exposed at on the Gateway: optional like the others, with the rules of an HTTPRoute */
export const exposurePath = {
    ...optionalPath,
    validate: {
        validator: (value?: string | null) => value == null || isExposurePath(value),
        message: (props: { path: string; value: unknown }) =>
            `${props.path} "${props.value}" is not a path an HTTPRoute takes: segments of letters, digits and -._~!$&'()*+,;=:@ or %XX, no query, fragment, // nor . or .. segment`
    }
}
