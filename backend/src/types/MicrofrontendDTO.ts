interface MicrofrontendDTO {
    id: string
    name: string
    url: string
    environment: string
    version?: string
    status?: "active" | "inactive"
    createdAt?: Date
    updatedAt?: Date
}

export default MicrofrontendDTO
