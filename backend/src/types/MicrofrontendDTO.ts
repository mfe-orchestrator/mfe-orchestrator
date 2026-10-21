import { CanaryDeploymentType, CanaryType, IHostMicrofrontend, MicrofrontendKind, MicrofrontendType } from "../models/MicrofrontendModel"
import { MicrofrontendStackDTO } from "./MicrofrontendStack"
import ServiceDTO from "./ServiceDTO"

/** The container fields of a FRONTEND, the same as a service's and checked the same way */
type FrontendContainerDTO = Pick<ServiceDTO, "image" | "port" | "livenessPath" | "readinessPath" | "docsPath" | "openApiPath" | "exposurePath" | "urls" | "env" | "configMapIds" | "secretIds">

interface MicrofrontendDTO extends FrontendContainerDTO {
    id: string
    type?: MicrofrontendType
    /** MICROFRONTEND when omitted. A FRONTEND never has parentIds */
    kind?: MicrofrontendKind
    name: string
    slug: string
    url: string
    environment: string
    /** The functional domain of the project it belongs to; null or blank takes it out of any */
    domainId?: string | null
    version?: string
    /** Markdown for AI agents about this microfrontend */
    context?: string
    /** Slug of the marketplace template the repository was scaffolded from */
    template?: string
    stack?: MicrofrontendStackDTO
    status?: "active" | "inactive"
    createdAt?: Date
    updatedAt?: Date
    parentIds?: string[]
    /** Omitted on create: the project's default hosting is used */
    host?: IHostMicrofrontend
    codeRepository: {
        enabled: boolean
        codeRepositoryId: string
        repositoryId: string
        name?: string
        cloneUrlHttps?: string
        cloneUrlSsh?: string
        gitlab?: {
            groupPath?: string
            groupId?: number
        }
        createData?: {
            name: string
            private?: boolean
            groupPath?: string
            template?: string
        }
    }
    canary: {
        enabled: boolean
        percentage: number
        type: CanaryType
        deploymentType: CanaryDeploymentType
        version: string
        url: string
    }
}

export default MicrofrontendDTO
