import useApiClient from "../useApiClient"

const useProjectWizardClient = () => {
    const api = useApiClient()

    const getState = async (projectId: string) => {
        const response = await api.doRequest({
            method: "GET",
            url: `/project-wizard/${projectId}`
        })
        return response.data
    }

    const next = async (projectId: string) => {
        const response = await api.doRequest({
            method: "GET",
            url: `/project-wizard/${projectId}/next`
        })
        return response.data
    }

    const prev = async (projectId: string) => {
        const response = await api.doRequest({
            method: "GET",
            url: `/project-wizard/${projectId}/prev`
        })
        return response.data
    }

    return {
        getState,
        next,
        prev
    }
}

export default useProjectWizardClient
