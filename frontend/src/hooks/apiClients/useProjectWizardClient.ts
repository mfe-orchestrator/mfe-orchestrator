import { WizardStatus, WizardStep, WizardStepDTO } from "@/types/ProjectWizardDTO"
import useApiClient from "../useApiClient"
import { Project } from "./useProjectApi"

export type { WizardStepDTO }
export { WizardStatus, WizardStep }

export interface WizardStateDTO {
    projectId: string
    project: Project
    status: WizardStatus
    currentStep: WizardStep
    currentStepSlug: string
    steps: WizardStepDTO[]
    canGoPrev: boolean
    canSkip: boolean
    machineVersion: number
}

/** Wizard layout, available before the project exists */
export interface WizardStepLayoutDTO {
    step: WizardStep
    slug: string
    index: number
    skippable: boolean
}

export interface WizardMainDataDTO {
    name: string
    description?: string
}

export interface WizardRecapDTO {
    environments: number
    storages: number
    codeRepositories: number
    users: number
}

const BASE_URL = "/api/projects/wizard"

/**
 * Client of the backend orchestrated wizard: every step change is a server
 * call, the response tells which step has to be rendered next.
 */
const useProjectWizardClient = () => {
    const api = useApiClient()

    const start = async (data: WizardMainDataDTO): Promise<WizardStateDTO> => {
        const response = await api.doRequest<WizardStateDTO>({
            method: "POST",
            url: BASE_URL,
            data
        })
        return response.data
    }

    const getSteps = async (): Promise<WizardStepLayoutDTO[]> => {
        const response = await api.doRequest<WizardStepLayoutDTO[]>({
            method: "GET",
            url: `${BASE_URL}/steps`
        })
        return response.data
    }

    const getPending = async (): Promise<WizardStateDTO | null> => {
        const response = await api.doRequest<WizardStateDTO | null>({
            method: "GET",
            url: `${BASE_URL}/pending`
        })
        return response.data
    }

    const getState = async (projectId: string): Promise<WizardStateDTO> => {
        const response = await api.doRequest<WizardStateDTO>({
            method: "GET",
            url: `${BASE_URL}/${projectId}`
        })
        return response.data
    }

    const next = async (projectId: string): Promise<WizardStateDTO> => {
        const response = await api.doRequest<WizardStateDTO>({
            method: "PUT",
            url: `${BASE_URL}/${projectId}/next`
        })
        return response.data
    }

    const prev = async (projectId: string): Promise<WizardStateDTO> => {
        const response = await api.doRequest<WizardStateDTO>({
            method: "PUT",
            url: `${BASE_URL}/${projectId}/prev`
        })
        return response.data
    }

    const skip = async (projectId: string): Promise<WizardStateDTO> => {
        const response = await api.doRequest<WizardStateDTO>({
            method: "PUT",
            url: `${BASE_URL}/${projectId}/skip`
        })
        return response.data
    }

    const goTo = async (projectId: string, stepOrSlug: string): Promise<WizardStateDTO> => {
        const response = await api.doRequest<WizardStateDTO>({
            method: "PUT",
            url: `${BASE_URL}/${projectId}/go-to/${stepOrSlug}`
        })
        return response.data
    }

    const saveMainData = async (projectId: string, data: WizardMainDataDTO): Promise<WizardStateDTO> => {
        const response = await api.doRequest<WizardStateDTO>({
            method: "PUT",
            url: `${BASE_URL}/${projectId}/main-data`,
            data
        })
        return response.data
    }

    const getRecap = async (projectId: string): Promise<WizardRecapDTO> => {
        const response = await api.doRequest<WizardRecapDTO>({
            method: "GET",
            url: `${BASE_URL}/${projectId}/recap`
        })
        return response.data
    }

    const abort = async (projectId: string): Promise<void> => {
        await api.doRequest({
            method: "DELETE",
            url: `${BASE_URL}/${projectId}`
        })
    }

    return {
        start,
        getSteps,
        getPending,
        getState,
        next,
        prev,
        skip,
        goTo,
        saveMainData,
        getRecap,
        abort
    }
}

export default useProjectWizardClient
