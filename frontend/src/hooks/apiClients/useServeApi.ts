import { AuthenticationType } from "@/api/apiClient"
import useApiClient from "../useApiClient"
import { GlobalVariable } from "./useGlobalVariablesApi"

export interface IServeMicrofrontend {
    url: string
    slug: string
    continuousDevelopment: boolean
}

export interface IServe {
    globalVariables: GlobalVariable[]
    microfrontends: IServeMicrofrontend[]
}

export type MicrofrontendFramework = "REACT" | "VUE" | "ANGULAR"
export type MicrofrontendCompiler = "VITE" | "WEBPACK" | "WEBCOMPONENT"
export type MicrofrontendStackSource = "TEMPLATE" | "DETECTED" | "MANUAL"

export interface IMicrofrontendStackDTO {
    framework?: MicrofrontendFramework
    compiler?: MicrofrontendCompiler
    source?: MicrofrontendStackSource
}

export interface ICodeIntegrationDTO {
    /** Bundler config and host bootstrap, ready to paste */
    code: string
    /** Where the config belongs in the repository */
    configPath?: string
    /** Packages the integration needs, and the command that installs them */
    dependencies: string[]
    installCommand?: string
    /** True when the stack integrates at runtime instead of through module federation */
    runtimeIntegration?: boolean
    /** The stack the instructions were generated for */
    stack: IMicrofrontendStackDTO
}

export interface ICodeIntegrationRequestDTO {
    microfrontendId: string
    deploymentId: string
    /** Both default to the stack stored on the microfrontend */
    framework?: MicrofrontendFramework
    compiler?: MicrofrontendCompiler
}

const useServeApi = () => {
    const apiClient = useApiClient()

    const getAll = async (environmentId: string): Promise<IServe> => {
        console.log("environmentId", environmentId)
        const response = await apiClient.doRequest<IServe>({
            url: "/api/serve/all/" + environmentId,
            method: "GET",
            authenticated: AuthenticationType.NONE
        })
        return response.data
    }

    const getCodeIntegration = async (dto: ICodeIntegrationRequestDTO): Promise<ICodeIntegrationDTO> => {
        const response = await apiClient.doRequest<ICodeIntegrationDTO>({
            url: "/api/serve/code",
            method: "GET",
            params: dto
        })
        return response.data
    }

    return {
        getAll,
        getCodeIntegration
    }
}

export default useServeApi
