import useApiClient from "../useApiClient"

/** What a service created from a service template starts with */
export interface ServiceDefaults {
    port: number
    livenessPath: string
    readinessPath: string
    docsPath?: string
    openApiPath?: string
}

export interface Market {
    _id: string
    name: string
    slug: string
    comingSoon?: boolean
    description: string
    icon: string
    framework: string
    tags: string[]
    version?: string
    author?: string
    license?: string
    repo?: string
    type?: string
    compiler?: string
    /** File of the build output a microfrontend created from the template is served by */
    entryPoint?: string
    /** Service templates only */
    serviceDefaults?: ServiceDefaults
    createdAt: Date
    updatedAt: Date
}

const useMarketApi = () => {
    const apiClient = useApiClient()

    const getMarkets = async (): Promise<Market[]> => {
        const response = await apiClient.doRequest<Market[]>({
            url: "/api/market"
        })
        return response.data
    }

    const getMarketBySlug = async (slug: string, options?: { silent?: boolean }): Promise<Market> => {
        const response = await apiClient.doRequest<Market>({
            url: `/api/market/${slug}`,
            silent: options?.silent
        })
        return response.data
    }

    return {
        getMarkets,
        getMarketBySlug
    }
}

export default useMarketApi
