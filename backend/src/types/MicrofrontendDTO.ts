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
        repositoryId: string,
        name: string,
        azure: {
            projectId: string
        },
        github: {
            organizationId: string
            private: boolean
        },
        gitlab: {
            groupId: number
            path: string
            private: boolean
        },
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
