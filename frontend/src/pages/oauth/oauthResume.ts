export const OAUTH_RESUME_KEY = "oauth.resume"

// Only a consent URL for an opaque handle is ever resumed: the stored value is user-writable.
const RESUMABLE_PATH = /^\/oauth\/consent\?request=[A-Za-z0-9_-]+$/

export const saveOAuthResume = (path: string) => {
    try {
        if (RESUMABLE_PATH.test(path)) sessionStorage.setItem(OAUTH_RESUME_KEY, path)
    } catch {
        // sessionStorage can be unavailable: the resume is only a safety net.
    }
}

export const clearOAuthResume = () => {
    try {
        sessionStorage.removeItem(OAUTH_RESUME_KEY)
    } catch {
        // see saveOAuthResume
    }
}

export const readOAuthResume = (): string | null => {
    try {
        const value = sessionStorage.getItem(OAUTH_RESUME_KEY)
        return value && RESUMABLE_PATH.test(value) ? value : null
    } catch {
        return null
    }
}
