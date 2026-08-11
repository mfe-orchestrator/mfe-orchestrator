import { CanaryDeploymentType, CanaryType } from "../models/MicrofrontendModel"
import { MicrofrontendStackDTO } from "./MicrofrontendStack"

interface MicrofrontendDTO {
    id: string
    name: string
    slug: string
    url: string
    environment: string
    version?: string
    /** Slug of the marketplace template the repository was scaffolded from */
    template?: string
    stack?: MicrofrontendStackDTO
    status?: "active" | "inactive"
    createdAt?: Date
    updatedAt?: Date
    parentIds?: string[]
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
