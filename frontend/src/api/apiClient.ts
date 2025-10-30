import axios, { AxiosRequestConfig, AxiosRequestHeaders, AxiosResponse, RawAxiosRequestHeaders } from "axios"
import UrlPattern from "url-pattern"

export enum AuthenticationType {
    REQUIRED,
    OPTIONAL,
    NONE
}

export interface IClientRequestMetadata {
    authenticated?: AuthenticationType
    doNotLog?: boolean
    addUTMFields?: boolean
    eventName?: string
}

export interface IClientRequestData<D> extends AxiosRequestConfig<D>, IClientRequestMetadata {
    urlParams?: Record<string, unknown>
    token?: string
}

export interface IUTMFields {
    utm_source?: string | null
    utm_medium?: string | null
    utm_campaign?: string | null
    utm_term?: string | null
    utm_content?: string | null
}

export const getUTMFields = (): IUTMFields | undefined => {
    try {
        const utmString = sessionStorage.getItem("utm")
        if (utmString) {
            return JSON.parse(utmString)
        }
    } catch (e) {
        console.warn("Failed to parse UTM fields from session storage:", e)
    }
    if (!URLSearchParams) {
        // eslint-disable-next-line no-console
        console.warn("Browser does not support URLSearchParams")
        return undefined
    }

    const usp = new URLSearchParams(window.location.search)
    const utm: IUTMFields = {
        utm_source: usp.get("utm_source"),
        utm_medium: usp.get("utm_medium"),
        utm_campaign: usp.get("utm_campaign"),
        utm_term: usp.get("utm_term"),
        utm_content: usp.get("utm_content")
    }
    return utm
}

const removeUTMFields = (): void => {
    if (!URLSearchParams) {
        return
    }

    const usp = new URLSearchParams(window.location.search)

    usp.delete("utm_source")
    usp.delete("utm_medium")
    usp.delete("utm_campaign")
    usp.delete("utm_term")
    usp.delete("utm_content")
    window.history.replaceState({}, document.title, window.location.pathname + usp.toString())
    sessionStorage.removeItem("utm")
}

const createUrl = (axiosOptions?: IClientRequestData<unknown>): string | undefined => {
    if (!axiosOptions) return undefined
    if (axiosOptions.urlParams && axiosOptions.url) {
        return new UrlPattern(axiosOptions.url).stringify(axiosOptions.urlParams)
    }
    return axiosOptions?.url
}

/**
 * Api request - R is the response interface, D is the data interface
 * @param config Initial configuration
 * @returns
 */
async function doRequest<R, D = unknown>(config?: IClientRequestData<D>): Promise<AxiosResponse<R>> {
    const { authenticated = AuthenticationType.REQUIRED, headers, addUTMFields, token, params, doNotLog = false, eventName, ...conf } = config || {}
    try {
        let headersNew: RawAxiosRequestHeaders = {}

        if (config.token) {
            headersNew["Authorization"] = `Bearer ${config.token}`
        }

        headersNew["Content-Type"] = "application/json"
        headersNew["Accept"] = "application/json"

        let queryParams = {
            ...params
        }

        if (headers) headersNew = { ...headersNew, ...headers }

        if (addUTMFields) {
            // Adding UTM fields
            const utm = getUTMFields()
            queryParams = {
                ...queryParams,
                ...utm
            }
        }

        const response = await axios.request<R, AxiosResponse<R>, D>({
            ...conf,
            headers: headersNew,
            params: queryParams,
            url: createUrl(config)
        })

        if (addUTMFields) {
            removeUTMFields()
        }

        if (eventName) {
            const event = new CustomEvent(eventName, {
                detail: response.data
            })
            window.dispatchEvent(event)
        }

        return response
    } catch (e) {
        console.error(e)
        throw e
    }
}

export const out = { doRequest }
export default out
