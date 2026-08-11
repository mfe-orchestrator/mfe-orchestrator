import useApiClient from "../useApiClient"
import { IMicrofrontendStackDTO } from "./useServeApi"

export type FederationIntegrationStatus = "ALREADY_INTEGRATED" | "CONFIG_TO_CREATE" | "CONFIG_TO_REPLACE" | "NO_REMOTES" | "STACK_UNKNOWN" | "RUNTIME_INTEGRATION" | "ERROR"

export interface FederationFileChange {
    path: string
    /** Absent when the file is not in the repository yet */
    currentContent?: string
    proposedContent: string
}

export interface MicrofrontendIntegrationPlan {
    microfrontendId: string
    slug: string
    name: string
    provider?: string
    repositoryName: string
    branch?: string
    stack: IMicrofrontendStackDTO
    status: FederationIntegrationStatus
    remotes: { name: string; slug: string }[]
    changes: FederationFileChange[]
    error?: string
}

export interface FederationIntegrationPlan {
    projectId: string
    microfrontends: MicrofrontendIntegrationPlan[]
}

export interface MicrofrontendIntegrationResult {
    microfrontendId: string
    slug: string
    name: string
    branch?: string
    applied: boolean
    writtenPaths: string[]
    error?: string
}

export interface FederationIntegrationApplyResult {
    projectId: string
    results: MicrofrontendIntegrationResult[]
}

function useIntegrationApi() {
    const apiClient = useApiClient()

    /** Dry run of the project wide module federation integration: nothing is written */
    const getModuleFederationPlan = async (): Promise<FederationIntegrationPlan> => {
        const response = await apiClient.doRequest<FederationIntegrationPlan>({
            method: "GET",
            url: "/api/integration/module-federation/plan"
        })
        return response.data
    }

    const applyModuleFederation = async (microfrontendIds: string[]): Promise<FederationIntegrationApplyResult> => {
        const response = await apiClient.doRequest<FederationIntegrationApplyResult>({
            method: "POST",
            url: "/api/integration/module-federation/apply",
            data: { microfrontendIds }
        })
        return response.data
    }

    return {
        getModuleFederationPlan,
        applyModuleFederation
    }
}

export default useIntegrationApi
