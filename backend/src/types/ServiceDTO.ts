import MicrofrontendDTO from "./MicrofrontendDTO"
import { ServiceStackDTO } from "./ServiceStack"

export interface ServiceEnvVariableDTO {
    name: string
    required?: boolean
    secret?: boolean
    description?: string
}

interface ServiceDTO {
    id?: string
    name: string
    slug: string
    description?: string
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
    healthcheckPath?: string
    env?: ServiceEnvVariableDTO[]
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
