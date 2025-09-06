import { CodeRepositoryProvider } from "../models/CodeRepositoryModel"

export interface CodeRepositoryCreateDTO {
    name: string
    provider: CodeRepositoryProvider
    accessToken: string
    refreshToken?: string
}

export interface CodeRepositoryUpdateDTO {
    name?: string
    provider?: CodeRepositoryProvider
    accessToken?: string
    refreshToken?: string
    isActive?: boolean
}

export interface CodeRepositoryResponseDTO {
    _id: string
    name: string
    provider: CodeRepositoryProvider
    isActive: boolean
    projectId: string
    createdAt: Date
    updatedAt: Date
}