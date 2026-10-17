import MicrofrontendDTO from "./MicrofrontendDTO"
import { ServiceStackDTO } from "./ServiceStack"

export interface ServiceEnvVariableDTO {
    name: string
    required?: boolean
    secret?: boolean
    description?: string
}

/** A key of the config map or of the secrets with its value per environment; a blank value leaves it unset there */
export interface ServiceVariableDTO {
    key: string
    values?: Array<{ environmentId: string; value?: string }>
}

interface ServiceDTO {
    id?: string
    name: string
    slug: string
    description?: string
    /** The functional domain of the project it belongs to; null or blank takes it out of any */
    domainId?: string | null
    /** Markdown for AI agents about this service */
    context?: string
    /** Slug of the marketplace template the repository was scaffolded from */
    template?: string
    stack?: ServiceStackDTO
    version?: string
    /** Same shape as a microfrontend's: `createData` creates the repository from a template */
    codeRepository?: MicrofrontendDTO["codeRepository"]
    image?: {
        repository?: string
    }
    port?: number
    livenessPath?: string
    readinessPath?: string
    /** The UI of the public API documentation; blank or null when the service has none */
    docsPath?: string | null
    /** The OpenAPI spec; blank or null when the service has none */
    openApiPath?: string | null
    env?: ServiceEnvVariableDTO[]
    configMap?: ServiceVariableDTO[]
    /** A value sent as the placeholder the API answers with keeps the stored one */
    secrets?: ServiceVariableDTO[]
    createdAt?: Date
    updatedAt?: Date
}

/** What the CI pipeline sends once it pushed the image of a tagged version */
export interface ServiceVersionRegistrationDTO {
    image: string
    digest?: string
    commitSha?: string
}

export default ServiceDTO
