import { CanaryDeploymentType, CanaryType } from "../models/MicrofrontendModel"

interface MicrofrontendDTO {
    id: string
    name: string
    slug: string
    url: string
    environment: string
    version?: string
    status?: "active" | "inactive"
    createdAt?: Date
    updatedAt?: Date
    parentIds?: string[]
    codeRepository: {
        enabled: boolean
        codeRepositoryId: string
        repositoryId: string
        name?: string
        gitlab?: {
            groupPath?: string
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
