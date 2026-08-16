import useApiClient from "../useApiClient"
import { IMicrofrontendStackDTO } from "./useServeApi"

export type FederationIntegrationStatus = "ALREADY_INTEGRATED" | "CONFIG_TO_CREATE" | "CONFIG_TO_REPLACE" | "NO_REMOTES" | "STACK_UNKNOWN" | "RUNTIME_INTEGRATION" | "NO_DOCUMENT" | "ERROR"

/**
 * The two integrations the console can write for you. They are planned and committed separately:
 * module federation is a bundler config baked into the build, the global variables are a script tag
 * the host document reads on every page load.
 */
export type IntegrationScope = "MODULE_FEDERATION" | "GLOBAL_VARIABLES"

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

    const SCOPE_PATHS: Record<IntegrationScope, string> = {
        MODULE_FEDERATION: "module-federation",
        GLOBAL_VARIABLES: "global-variables"
    }

    /** Dry run of the project wide integration of one scope: nothing is written */
    const getPlan = async (scope: IntegrationScope): Promise<FederationIntegrationPlan> => {
        const response = await apiClient.doRequest<FederationIntegrationPlan>({
            method: "GET",
            url: `/api/integration/${SCOPE_PATHS[scope]}/plan`
        })
        return response.data
    }

    const apply = async (scope: IntegrationScope, microfrontendIds: string[]): Promise<FederationIntegrationApplyResult> => {
        const response = await apiClient.doRequest<FederationIntegrationApplyResult>({
            method: "POST",
            url: `/api/integration/${SCOPE_PATHS[scope]}/apply`,
            data: { microfrontendIds }
        })
        return response.data
    }

    return {
        getPlan,
        apply
    }
}

export default useIntegrationApi
