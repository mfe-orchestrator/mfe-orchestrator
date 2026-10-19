import useApiClient from "../useApiClient"
import type { CanaryDeploymentType, CanaryType } from "./useMicrofrontendsApi"

/** A microfrontend of the domain as the environment serves it */
export interface DeployedMicrofrontend {
    _id: string
    slug: string
    name: string
    /** As frozen in the deployment the environment serves; null when it was never deployed there */
    version: string | null
    /**
     * Only when the canary is enabled in that deployment. The percentage applies to RANDOM and ON_SESSION
     * only (ON_USER serves the enrolled users); version is null for a canary based on a URL.
     */
    canary: { type: CanaryType; deploymentType: CanaryDeploymentType; percentage: number; version: string | null } | null
}

/** A service of the domain as the deploy pipeline reported it for the environment */
export interface DeployedService {
    _id: string
    slug: string
    name: string
    /** The latest version reported; null when none was */
    version: string | null
    deployedAt: string | null
}

export interface EnvironmentDeployment {
    environment: { _id: string; name: string; slug: string; color: string; isProduction: boolean }
    /** The deployment the environment serves, null when nothing was ever deployed there */
    deployment: { deploymentId: string; deployedAt: string } | null
    microfrontends: DeployedMicrofrontend[]
    services: DeployedService[]
}

export interface DomainDeployments {
    /** null for the members that are in no domain */
    domain: { _id: string; name: string; slug: string } | null
    /** In the order of the environments of the project */
    environments: EnvironmentDeployment[]
}

const useDomainDeploymentsApi = () => {
    const apiClient = useApiClient()

    /** Every domain of the project, then the members in no domain when there are any */
    const getByProject = async (): Promise<DomainDeployments[]> => {
        const response = await apiClient.doRequest<DomainDeployments[]>({ url: "/api/domains/deployments" })
        return response.data
    }

    const getByDomainId = async (domainId: string): Promise<DomainDeployments> => {
        const response = await apiClient.doRequest<DomainDeployments>({ url: `/api/domains/${domainId}/deployments` })
        return response.data
    }

    return { getByProject, getByDomainId }
}

export default useDomainDeploymentsApi
