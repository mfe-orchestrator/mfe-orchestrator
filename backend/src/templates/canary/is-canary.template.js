/**
 * Canary shim - cookie strategy (CanaryType.COOKIE_BASED / ON_SESSIONS).
 *
 * This file is NOT executed by the backend: it is a template rendered on the fly and
 * served in place of the microfrontend `remoteEntry.js`, at the very same static URL the
 * consumer already has in its webpack/vite config. No change is required on the host side.
 *
 * It runs inside the host page context, so `document.cookie` here reads the HOST's
 * first-party cookies - the ones the backend can never see on a cross-site subresource
 * request. That is the whole point of doing the decision client side.
 *
 * Placeholders (all inside string literals, so this file stays valid JS):
 *   {{CONTAINER_NAME}}       Module Federation container global, e.g. "checkout"
 *   {{STABLE_URL}}           Absolute URL of the stable remoteEntry.js
 *   {{CANARY_URL}}           Absolute URL of the canary remoteEntry.js
 *   {{COOKIE_NAME}}          Host cookie holding the decision, e.g. "mia_app_is_canary"
 *   {{CANARY_PERCENTAGE}}    0-100, used only when the cookie is absent
 *   {{STICKY_STORAGE_KEY}}   localStorage key holding the sticky bucketing id
 *   {{ALLOW_QUERY_OVERRIDE}} "true" to honour ?mfeo_canary=1|0 (handy for QA)
 *
 * Must be served with `Cache-Control: no-store`, otherwise the decision gets frozen in cache.
 */
;(() => {
    const CONTAINER_NAME = "{{CONTAINER_NAME}}"
    const STABLE_URL = "{{STABLE_URL}}"
    const CANARY_URL = "{{CANARY_URL}}"
    const COOKIE_NAME = "{{COOKIE_NAME}}"
    const CANARY_PERCENTAGE = Number("{{CANARY_PERCENTAGE}}") || 0
    const STICKY_STORAGE_KEY = "{{STICKY_STORAGE_KEY}}"
    const ALLOW_QUERY_OVERRIDE = "{{ALLOW_QUERY_OVERRIDE}}" === "true"

    // Read synchronously: `document.currentScript` is null inside async callbacks.
    const currentScript = document.currentScript
    const crossOrigin = currentScript ? currentScript.crossOrigin : null

    /**
     * Cookie lookup by exact name. Deliberately not regex-based: the name would end up
     * being interpreted as a pattern.
     */
    const readCookie = name => {
        const raw = document.cookie
        if (!raw) return null
        for (const chunk of raw.split(";")) {
            const part = chunk.trim()
            if (part.startsWith(`${name}=`)) {
                const value = part.slice(name.length + 1)
                try {
                    return decodeURIComponent(value)
                } catch {
                    return value
                }
            }
        }
        return null
    }

    const isTruthy = value => value === "true" || value === "1" || value === "yes"
    const isFalsy = value => value === "false" || value === "0" || value === "no"

    /** FNV-1a, 32 bit. Math.imul keeps the multiplication in integer range. */
    const hash = str => {
        let h = 2166136261
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i)
            h = Math.imul(h, 16777619)
        }
        return h >>> 0
    }

    const randomId = () => {
        try {
            if (window.crypto && typeof window.crypto.randomUUID === "function") {
                return window.crypto.randomUUID()
            }
        } catch {
            /* crypto unavailable */
        }
        return String(Math.random()).slice(2) + String(Date.now())
    }

    /**
     * Stable per-browser id used for percentage bucketing. Lives in the HOST's
     * localStorage, so it is first-party and survives third-party cookie blocking.
     * When storage is unavailable (private mode, sandboxed iframe) the id is per page
     * load and the bucket is therefore NOT sticky - the user may flip between variants
     * across reloads.
     */
    const stickyId = () => {
        try {
            const existing = window.localStorage.getItem(STICKY_STORAGE_KEY)
            if (existing) return existing
            const generated = randomId()
            window.localStorage.setItem(STICKY_STORAGE_KEY, generated)
            return generated
        } catch {
            return randomId()
        }
    }

    const queryOverride = () => {
        if (!ALLOW_QUERY_OVERRIDE) return null
        try {
            const value = new URLSearchParams(window.location.search).get("mfeo_canary")
            if (value === null) return null
            if (isTruthy(value)) return true
            if (isFalsy(value)) return false
        } catch {
            /* malformed query string */
        }
        return null
    }

    /**
     * Decision order: explicit query override, then host cookie, then sticky percentage.
     * The bucket is salted with the container name so different microfrontends roll
     * independently for the same user.
     */
    const pickUrl = () => {
        const override = queryOverride()
        if (override !== null) return override ? CANARY_URL : STABLE_URL

        const cookie = readCookie(COOKIE_NAME)
        if (cookie !== null) {
            if (isTruthy(cookie)) return CANARY_URL
            if (isFalsy(cookie)) return STABLE_URL
        }

        if (CANARY_PERCENTAGE <= 0) return STABLE_URL
        if (CANARY_PERCENTAGE >= 100) return CANARY_URL

        return hash(`${stickyId()}|${CONTAINER_NAME}`) % 100 < CANARY_PERCENTAGE ? CANARY_URL : STABLE_URL
    }

    /**
     * Loads the real remoteEntry and hands back its container.
     *
     * The real bundle installs itself on `window[CONTAINER_NAME]`, overwriting this proxy.
     * We grab it in `onload` - which fires synchronously right after the script body ran,
     * before anything else can look at the global - and immediately put the proxy back, so
     * the host's webpack runtime only ever sees the proxy.
     */
    const loadScript = url =>
        new Promise((resolve, reject) => {
            const proxy = window[CONTAINER_NAME]
            const element = document.createElement("script")
            element.src = url
            element.async = true
            if (crossOrigin) element.crossOrigin = crossOrigin

            element.onload = () => {
                const container = window[CONTAINER_NAME]
                window[CONTAINER_NAME] = proxy
                if (!container || container === proxy) {
                    reject(new Error(`[mfe-orchestrator] ${url} did not define the container '${CONTAINER_NAME}'`))
                    return
                }
                resolve(container)
            }

            element.onerror = () => {
                window[CONTAINER_NAME] = proxy
                reject(new Error(`[mfe-orchestrator] failed to load ${url}`))
            }

            document.head.appendChild(element)
        })

    let containerPromise = null

    const loadContainer = () => {
        if (containerPromise) return containerPromise
        const url = pickUrl()
        containerPromise = loadScript(url).catch(error => {
            // A broken canary must not take the host down: degrade to stable.
            if (url === CANARY_URL && CANARY_URL !== STABLE_URL) {
                if (typeof console !== "undefined" && console.warn) {
                    console.warn(`[mfe-orchestrator] canary bundle for '${CONTAINER_NAME}' failed, falling back to stable`, error)
                }
                return loadScript(STABLE_URL)
            }
            throw error
        })
        return containerPromise
    }

    // Proxy container. `init` and `get` are promise-returning by contract, so deferring
    // the actual bundle load behind them is transparent to the host runtime.
    if (!window[CONTAINER_NAME]?.__mfeoCanaryProxy) {
        window[CONTAINER_NAME] = {
            __mfeoCanaryProxy: true,
            init: (...args) => loadContainer().then(container => container.init(...args)),
            get: moduleName => loadContainer().then(container => container.get(moduleName))
        }
    }
})()
