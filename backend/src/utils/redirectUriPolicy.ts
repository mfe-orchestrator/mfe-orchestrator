/**
 * Which redirect URIs a MCP client may register, and how a requested one is matched.
 *
 * MCP clients are mostly native applications (IDEs, desktop apps, CLIs): they receive the code on a
 * loopback port or on a private-use scheme, so both have to be accepted next to https. What is
 * refused is anything that would hand the code to a page the client does not control (plain http
 * on a real host) or that is not a navigation target at all (javascript:, data:, ...).
 */

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"])

/** Schemes a browser would execute or render instead of handing over to an application. */
const FORBIDDEN_SCHEMES = new Set(["javascript:", "data:", "vbscript:", "file:", "about:", "blob:", "ftp:", "ws:", "wss:"])

export type RedirectUriWarning = "localhost" | "custom_scheme"

const parse = (uri: string): URL | undefined => {
    try {
        return new URL(uri)
    } catch {
        return undefined
    }
}

export const isLoopbackRedirect = (url: URL): boolean => url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname)

const isCustomScheme = (url: URL) => url.protocol !== "http:" && url.protocol !== "https:"

/**
 * Why a redirect URI cannot be registered, or undefined when it can.
 *
 * Fragments are refused because RFC 6749 §3.1.2 forbids them, and credentials in the URI because
 * the consent page would show them to the user as part of the host.
 */
export const validateRedirectUri = (uri: unknown): string | undefined => {
    if (typeof uri !== "string" || uri.length === 0 || uri.length > 2048) {
        return "redirect URI must be a non-empty string"
    }
    const url = parse(uri)
    if (!url) {
        return `redirect URI is not an absolute URI: ${uri}`
    }
    if (url.hash) {
        return `redirect URI must not contain a fragment: ${uri}`
    }
    if (url.username || url.password) {
        return `redirect URI must not contain credentials: ${uri}`
    }
    if (FORBIDDEN_SCHEMES.has(url.protocol)) {
        return `redirect URI scheme is not allowed: ${url.protocol}`
    }
    if (url.protocol === "http:" && !isLoopbackRedirect(url)) {
        return `plain http is only allowed on a loopback address: ${uri}`
    }
    return undefined
}

/**
 * Whether the redirect URI of an authorization request is one the client registered.
 *
 * Exact string comparison, with the one exception RFC 8252 §7.3 requires: a native app listening
 * on loopback gets an ephemeral port from the OS, so on loopback the port is not compared.
 */
export const matchesRegisteredRedirectUri = (requested: string, registered: string[]): boolean => {
    if (registered.includes(requested)) {
        return true
    }
    const requestedUrl = parse(requested)
    if (!requestedUrl || !isLoopbackRedirect(requestedUrl)) {
        return false
    }
    return registered.some(candidate => {
        const candidateUrl = parse(candidate)
        return (
            candidateUrl !== undefined &&
            isLoopbackRedirect(candidateUrl) &&
            candidateUrl.hostname === requestedUrl.hostname &&
            candidateUrl.pathname === requestedUrl.pathname &&
            candidateUrl.search === requestedUrl.search
        )
    })
}

/**
 * The part of the redirect URI the consent page highlights: where the code is going to end up.
 * For a private-use scheme there is no host worth showing, so the scheme itself is the answer.
 */
export const describeRedirectHost = (uri: string): string => {
    const url = parse(uri)
    if (!url) return uri
    if (isCustomScheme(url)) {
        return url.host ? `${url.protocol}//${url.host}` : url.protocol
    }
    return url.host
}

/** What the consent page should warn about for this redirect URI. */
export const redirectUriWarnings = (uri: string): RedirectUriWarning[] => {
    const url = parse(uri)
    if (!url) return []
    if (isLoopbackRedirect(url)) return ["localhost"]
    if (isCustomScheme(url)) return ["custom_scheme"]
    return []
}
