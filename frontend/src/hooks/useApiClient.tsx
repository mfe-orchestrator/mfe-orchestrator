import { AxiosResponse } from "axios"
import { IClientRequestData } from "../api/apiClient"
import ApiClient, { AuthenticationType, IClientRequestMetadata } from "../api/apiClient"
//import useTheme from "./useTheme"

export interface IViolations {
    field: string
    message: string
}

export interface IClientRequestMetadataExtended extends IClientRequestMetadata {
    silent?: boolean
    customErrorMessage?: string | ((error: any) => string)
}

export interface IClientRequestDataExtended<D> extends IClientRequestData<D>, IClientRequestMetadataExtended {}

export interface IApiClientOptions {
    baseURL?: string
    customErrorMessage?: string | ((error: any) => string)
    country?: string
}

export const useApiClient = (options?: IApiClientOptions) => {
    //const theme = useTheme()

    async function doRequest<R, D = unknown>(config?: IClientRequestDataExtended<D>): Promise<AxiosResponse<R>> {
        const realConfig = {
            ...(options || {}),
            ...(config || {})
        }

        const { silent = false, token, authenticated = AuthenticationType.REQUIRED, ...conf } = realConfig

        try {
            let tokenReal = undefined

            try {
                if (authenticated == AuthenticationType.REQUIRED) {
                    tokenReal = await getToken(token)
                } else if (authenticated == AuthenticationType.OPTIONAL) {
                    if (isAuthenticated() || token) {
                        tokenReal = await getToken(token)
                    }
                }
            } catch (e) {
                console.error(e, "doRequest - authenticated branch", config)
            }

            //logger.info("[tokenReal]", "[doRequest]", { tokenReal })
            const result = await ApiClient.doRequest<R, D>({
                token: tokenReal,
                authenticated,
                ...conf,
                doNotLog: true
            })

            return result
        } catch (e: any) {
            console.error(e)
            /*if (!silent) {
                theme.showErrorNotification({
                    message: getErrorNotification(realConfig.customErrorMessage, e),
                    errorCode: e?.response?.data?.errorCode
                })
            }*/
            throw e
        }
    }

    const getToken = async (token?: string): Promise<string | undefined> => {
        if (token) return token
        // //console.log("Getting TOKEN", msalAuth.instance.getActiveAccount(), msalAuth.accounts, stepAuth.isAuthenticated)
        // if (stepAuth.isAuthenticated) {
        //     //console.log("Getting TOKEN with Auth0")
        //     return (await stepAuth.getAccessTokenSilently())?.access_token
        // } else if (msalAuth && msalAuth.instance && msalAuth.accounts && msalAuth.accounts.length > 0) {
        //     //console.log("Getting TOKEN with MSAL")
        //     try {
        //         const activeAccount = msalAuth.instance.getActiveAccount()
        //         //console.log("[getToken] Sto prendedo l'access token silent su questo account", activeAccount)
        //         const response = await msalAuth.instance.acquireTokenSilent({
        //             scopes: ["openid", "profile", "email", "offline_access"],
        //             account: activeAccount || undefined
        //         })
        //         return response.idToken
        //     } catch (error) {
        //         if (error instanceof Error && error.name === "InteractionRequiredAuthError") {
        //             const response = await msalAuth.instance.handleRedirectPromise()
        //             if (response) {
        //                 msalAuth.instance.setActiveAccount(response.account)
        //             }
        //             return response?.idToken
        //         }
        //     }
        // } else {
        //     logger.warn("No authentication method available to get token", "getToken", { token, authenticatedAuth0: stepAuth.isAuthenticated, authenticatedMSALAccounts: msalAuth.accounts })
        // }
    }

    const isAuthenticated = (): boolean => {
        return false;
        // const activeAccount = msalAuth.instance.getActiveAccount()
        // return stepAuth.isAuthenticated || Boolean(activeAccount)
    }

    // const getErrorNotification = (customErrorMessage?: any, e?: any): string | React.ReactNode => {
    //     if (typeof customErrorMessage === "function") return customErrorMessage(e)
    //     if (customErrorMessage) return customErrorMessage
    //     if (!e) return "Error"
    //     const responseData = e?.response?.data
    //     if (responseData) {
    //         if (responseData.message) return responseData.message
    //         if (responseData.violations) {
    //             const violations: IViolations[] = responseData.violations
    //             const messageData = (
    //                 <div style={{ display: "flex", flexDirection: "column", textAlign: "left" }} className="error-message-toast-notification-payload">
    //                     {responseData.title && <p>{responseData.title}</p>}
    //                     {violations.map(single => {
    //                         return (
    //                             <div key={single.field}>
    //                                 {single.field} - {single.message}
    //                             </div>
    //                         )
    //                     })}
    //                 </div>
    //             )
    //             return messageData
    //         }
    //         if (responseData.title) return responseData.title
    //     }
    //     return e.message
    // }

    return {
        doRequest
    }
}

export default useApiClient
