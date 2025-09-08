import { CanaryDeploymentType, CanaryType } from "../models/MicrofrontendModel"

interface MicrofrontendDTO {
    id: string
    name: string
    url: string
    environment: string
    version?: string
    status?: "active" | "inactive"
    createdAt?: Date
    updatedAt?: Date
    codeRepository: {
        enabled: boolean
        repositoryId: string
        azure: {
            projectId: string
        }
        name: string
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
