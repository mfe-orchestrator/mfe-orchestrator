import { useAuth0 } from "@auth0/auth0-react"
import { AccountEntity, AccountInfo } from "@azure/msal-browser"
import { useMsal } from "@azure/msal-react"
import { AxiosError, AxiosResponse } from "axios"
import { getToken as getTokenFromStorage, IToken, setToken } from "@/authentication/tokenUtils"
import useProjectStore from "@/store/useProjectStore"
import useToastNotificationStore from "@/store/useToastNotificationStore"
import ApiClient, { AuthenticationType, IClientRequestData, IClientRequestMetadata } from "../api/apiClient"

export interface IViolations {
    field: string
    message: string
}

interface IErrorResponse {
    message?: string
    violations?: IViolations[]
    title?: string
}

export interface IClientRequestMetadataExtended extends IClientRequestMetadata {
    silent?: boolean
    customErrorMessage?: string | ((error: Error) => string)
}

export interface IClientRequestDataExtended<D> extends IClientRequestData<D>, IClientRequestMetadataExtended {}

export interface IApiClientOptions {
    baseURL?: string
    customErrorMessage?: string | ((error: Error) => string)
    country?: string
}

export const useApiClient = (options?: IApiClientOptions) => {
    const msalAuth = useMsal()
    const auth0Auth = useAuth0()
    const notifications = useToastNotificationStore()
    const projectStore = useProjectStore()

    async function doRequest<R, D = unknown>(config?: IClientRequestDataExtended<D>): Promise<AxiosResponse<R>> {
        const realConfig = {
            ...(options || {}),
            ...(config || {})
        }

        //console.log("[doRequest] Inizio a fare la richiesta", realConfig.url)

        const { silent = false, token, authenticated = AuthenticationType.REQUIRED, ...conf } = realConfig

        try {
            let tokenReal: IToken | undefined = undefined

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

            const result = await ApiClient.doRequest<R, D>({
                token: tokenReal?.token,
                doNotLog: true,
                ...conf,
                headers: {
                    ...(conf?.headers || {}),
                    issuer: tokenReal?.issuer,
                    "Project-Id": projectStore.project?._id,
                    "Environment-Id": projectStore.environment?._id
                },
                authenticated
            })

            //console.log("[doRequest] Ho fatto la richiesta", realConfig.url, result.data)
            return result
        } catch (e: unknown) {
            console.error("[doRequest] Erro in request ", realConfig.url, e)
            console.error(e)
            if (!silent) {
                notifications.showErrorNotification({
                    message: getErrorNotification(realConfig.customErrorMessage, e as Error)
                    //errorCode: e?.response?.data?.errorCode
                })
            }
            throw e
        }
    }

    const getActiveMsalAccount = async (): Promise<AccountInfo | undefined> => {
        if (!msalAuth || !msalAuth.instance) return undefined
        const active = await msalAuth.instance.getActiveAccount()
        if (active) return active
        const all = await msalAuth.instance.getAllAccounts()
        if (all.length > 0) return all[0]
        return undefined
    }

    const getToken = async (token?: string): Promise<IToken | undefined> => {
        if (token) return { token, issuer: "", expiresAt: "" }
        const tokenLocal = getTokenFromStorage()
        if (tokenLocal) {
            if (tokenLocal.issuer === "google") {
                if (tokenLocal.expiresAt && Date.now() < Number(tokenLocal.expiresAt)) {
                    return tokenLocal
                } else {
                    // Token scaduto, fai il refresh
                    if (tokenLocal.refreshToken) {
                        try {
                            const response = await ApiClient.doRequest<{
                                access_token: string
                                expires_in: number
                                refresh_token?: string
                            }>({
                                url: "/auth/google/refresh",
                                method: "POST",
                                authenticated: AuthenticationType.NONE,
                                data: {
                                    refresh_token: tokenLocal.refreshToken
                                }
                            })

                            const newExpiresAt = String(Date.now() + response.data.expires_in * 1000)
                            const newRefreshToken = response.data.refresh_token || tokenLocal.refreshToken

                            setToken(response.data.access_token, "google", newExpiresAt, newRefreshToken)

                            return {
                                token: response.data.access_token,
                                issuer: "google",
                                expiresAt: newExpiresAt,
                                refreshToken: newRefreshToken
                            }
                        } catch (error) {
                            console.error("Failed to refresh Google token:", error)
                            // Se il refresh fallisce, ritorna il token esistente
                            return tokenLocal
                        }
                    }
                }
            }
            return tokenLocal
        }
        if (auth0Auth.isAuthenticated) {
            return {
                token: await auth0Auth.getAccessTokenSilently(),
                issuer: "auth0"
            }
        }
        const activeMsalAccount = await getActiveMsalAccount()
        if (activeMsalAccount) {
            try {
                //console.log("[getToken] Inizio a prendere il token con MSFT")
                //console.log("[getToken] Sto prendedo l'access token silent su questo account", activeMsalAccount)
                const response = await msalAuth.instance.acquireTokenSilent({
                    scopes: ["openid", "profile", "email", "offline_access"],
                    account: activeMsalAccount || undefined
                })
                //console.log("[getToken] Ho ottenuto il token", response)
                return {
                    token: response.idToken,
                    issuer: "msal"
                }
            } catch (error) {
                if (error instanceof Error && error.name === "InteractionRequiredAuthError") {
                    const response = await msalAuth.instance.handleRedirectPromise()
                    if (response) {
                        msalAuth.instance.setActiveAccount(response.account)
                    }
                    return {
                        token: response?.idToken,
                        issuer: "msal"
                    }
                } else {
                    console.error("[getToken] No authentication method available to get token", { token, authenticatedAuth0: auth0Auth.isAuthenticated, authenticatedMSALAccounts: msalAuth.accounts })
                }
            }
        } else {
            console.error("No authentication method available to get token", {
                token,
                authenticatedAuth0: auth0Auth.isAuthenticated,
                authenticatedMSALAccounts: msalAuth.accounts,
                msalInstance: msalAuth.instance,
                maslAccountsFromRequest: msalAuth.instance.getAllAccounts()
            })
        }
    }

    const isAuthenticated = (): boolean => {
        const token = getTokenFromStorage()
        if (token) return true
        const activeAccount = msalAuth.instance.getActiveAccount()
        return auth0Auth.isAuthenticated || Boolean(activeAccount)
    }

    const getErrorNotification = (customErrorMessage?: string | ((error: Error) => string), e?: Error): string | React.ReactNode => {
        if (typeof customErrorMessage === "function") return customErrorMessage(e as Error)
        if (customErrorMessage) return customErrorMessage
        if (!e) return "Error"
        const axiosError = e as AxiosError<IErrorResponse>
        const responseData = axiosError?.response?.data
        if (responseData) {
            if (responseData.message) return responseData.message
            if (responseData.violations) {
                const violations: IViolations[] = responseData.violations
                const messageData = (
                    <div style={{ display: "flex", flexDirection: "column", textAlign: "left" }} className="error-message-toast-notification-payload">
                        {responseData.title && <p>{responseData.title}</p>}
                        {violations.map(single => {
                            return (
                                <div key={single.field}>
                                    {single.field} - {single.message}
                                </div>
                            )
                        })}
                    </div>
                )
                return messageData
            }
            if (responseData.title) return responseData.title
        }
        return e.message
    }

    return {
        doRequest
    }
}

export default useApiClient
