import useApiClient from "../useApiClient"


interface InjectRemotesInHostParams {
    microfrontendId: string
    deploymentId?: string
    environmentId?: string
}
function useIntegrationApi() {

    const apiClient = useApiClient();

    const injectRemotesInHost = async (params: InjectRemotesInHostParams) => {
        return apiClient.doRequest({
            method: "POST",
            url: `/api/microfrontend/${params.microfrontendId}/host-injection`,
            params: {
                deploymentId: params.deploymentId,
                environmentId: params.environmentId
            }
        })
    }

    return {
        injectRemotesInHost
    }
}

export default useIntegrationApi