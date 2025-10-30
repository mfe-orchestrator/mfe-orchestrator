import { useQuery } from "@tanstack/react-query"
import { createContext, useContext } from "react"
import { AuthenticationType } from "@/api/apiClient"
import ApiDataFetcher from "@/components/ApiDataFetcher/ApiDataFetcher"
import useApiClient from "@/hooks/useApiClient"
import GlobalConfigDTO from "@/types/ConfigResponseDTO"

interface IGlobalParametersContext {
    getParameter: (key: string) => unknown
}

const GlobalParameterContext = createContext<IGlobalParametersContext | undefined>(undefined)

export const GlobalParameterProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
    const api = useApiClient()

    const parametersQuery = useQuery({
        queryKey: ["parameters"],
        queryFn: () => {
            return api
                .doRequest<GlobalConfigDTO>({
                    authenticated: AuthenticationType.NONE,
                    url: "/api/configuration"
                })
                .then(r => r.data)
        }
    })

    const getParameter = (key: string): unknown => {
        if (!parametersQuery.data) return undefined

        const result = key.split(".").reduce<unknown>((obj, part) => {
            if (obj && typeof obj === "object" && part in obj) {
                return (obj as Record<string, unknown>)[part]
            }
            return undefined
        }, parametersQuery.data)

        return result
    }

    return (
        <ApiDataFetcher queries={[parametersQuery]}>
            <GlobalParameterContext.Provider
                value={{
                    getParameter
                }}
            >
                {children}
            </GlobalParameterContext.Provider>
        </ApiDataFetcher>
    )
}

export const useGlobalParameters = () => {
    const context = useContext(GlobalParameterContext)
    if (context === undefined) {
        throw new Error("useGlobalParameters must be used within an GlobalParameterProvider")
    }
    return context
}
